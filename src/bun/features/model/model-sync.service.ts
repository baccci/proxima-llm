import { z } from 'zod'
import { compareEffort, Effort } from '../../../shared-contracts/models/effort'
import { ProviderId } from '../../../shared-contracts/providers/registry'
import type { ModelCapabilities } from '../../../shared-contracts/schemas/model.schema'
import { ModelSource } from '../../infra/db/model-source'
import { log } from '../../infra/logging/logger'
import {
  getSyncState,
  hasStalePricing,
  reconcileMissingModels,
  type SyncedModelRow,
  setSyncState,
  upsertSyncedModel,
} from './model.repository'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const SYNC_THROTTLE_HOURS = 24
const SYNC_THROTTLE_MS = SYNC_THROTTLE_HOURS * 60 * 60 * 1000
// Bump when sync logic or schema changes to force a re-sync on next startup.
const SYNC_VERSION = 3
// Fallback when OpenRouter does not report a model's max output tokens.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192

// Tokens OpenRouter advertises in a model's supported_parameters / input_modalities.
// Named here so the capability mapping reads against its vocabulary, not bare strings.
const OPENROUTER_PARAM = {
  reasoning: 'reasoning',
  includeReasoning: 'include_reasoning',
  tools: 'tools',
} as const
const OPENROUTER_MODALITY = {
  image: 'image',
  file: 'file',
} as const

// One entry of the OpenRouter catalog. Parsed per item at the network boundary so a
// malformed row is skipped, not fatal to the whole sync.
const OpenRouterModel = z.object({
  id: z.string(),
  name: z.string(),
  pricing: z.object({ prompt: z.string(), completion: z.string() }),
  architecture: z.object({ input_modalities: z.array(z.string()).optional() }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  reasoning: z
    .object({
      mandatory: z.boolean().optional(),
      supported_efforts: z.array(z.string()).optional(),
      default_effort: z.string().optional(),
      default_enabled: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  context_length: z.number().optional(),
  top_provider: z
    .object({
      max_completion_tokens: z.number().optional(),
      context_length: z.number().optional(),
    })
    .optional(),
})
type OpenRouterModel = z.infer<typeof OpenRouterModel>

const OpenRouterModelsResponse = z.object({ data: z.array(z.unknown()) })

// Family groups a synced model by its OpenRouter vendor prefix, so "google/gemma-2-9b" lands under "google".
function deriveFamily(id: string): string {
  return id.split('/')[0] ?? 'unknown'
}

// Turn the OpenRouter reasoning object into the reasoning-related capability fields.
// Pure so it can be unit-tested; mapToRow (IO-bound) folds the result into the row.
// default_enabled is intentionally not consumed in v1 (a deferred refinement).
export function mapReasoning(
  reasoning: OpenRouterModel['reasoning'],
  params: string[],
): {
  thinking: boolean
  reasoningMandatory: boolean
  efforts: Effort[]
  defaultEffort: Effort | null
} {
  // A model can reason if it carries a reasoning object, or (older rows) advertises a
  // reasoning param without one.
  const thinking =
    reasoning != null ||
    params.includes(OPENROUTER_PARAM.reasoning) ||
    params.includes(OPENROUTER_PARAM.includeReasoning)

  // supported_efforts arrives highest-first and may include `none` or future tokens;
  // keep only values in our Effort vocabulary, then reorder low→high.
  const efforts: Effort[] = []
  for (const raw of reasoning?.supported_efforts ?? []) {
    const parsed = Effort.safeParse(raw)
    if (parsed.success) {
      efforts.push(parsed.data)
    }
  }
  efforts.sort(compareEffort)

  const parsedDefault = Effort.safeParse(reasoning?.default_effort)

  return {
    thinking,
    reasoningMandatory: reasoning?.mandatory ?? false,
    efforts,
    defaultEffort: parsedDefault.success ? parsedDefault.data : null,
  }
}

// Convert one entry from the OpenRouter catalog into a persistable model row.
function mapToRow(m: OpenRouterModel): SyncedModelRow {
  const modalities = m.architecture?.input_modalities ?? []
  const params = m.supported_parameters ?? []
  const maxOutputTokens = m.top_provider?.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  const contextWindow = m.top_provider?.context_length ?? m.context_length

  const capabilities: ModelCapabilities = {
    thinking:
      params.includes(OPENROUTER_PARAM.reasoning) ||
      params.includes(OPENROUTER_PARAM.includeReasoning),
    vision: modalities.includes(OPENROUTER_MODALITY.image),
    pdf: modalities.includes(OPENROUTER_MODALITY.file),
    tools: params.includes(OPENROUTER_PARAM.tools),
    // OpenRouter has no per-model prompt-cache flag; web search is a universal plugin.
    promptCaching: false,
    webSearch: true,
    maxOutputTokens,
    ...(contextWindow !== undefined ? { contextWindow } : {}),
  }

  const pricing = {
    prompt: Number(m.pricing.prompt) || 0,
    completion: Number(m.pricing.completion) || 0,
  }

  return {
    id: m.id,
    provider: ProviderId.enum.openrouter,
    family: deriveFamily(m.id),
    displayName: m.name,
    capabilities,
    pricing,
    source: ModelSource.enum.openrouter,
  }
}

export function getLastSyncTimestamp(): number | null {
  return getSyncState().ts
}

export async function syncOpenRouterModels(onSynced?: () => void, force = false): Promise<void> {
  const { ts: lastSync, version: storedVersion } = getSyncState()
  const versionMismatch = storedVersion !== SYNC_VERSION
  const stalePricing = hasStalePricing()

  // Skip when a recent sync already ran, unless forced, the sync version changed,
  // or stored pricing is stale.
  if (
    !force &&
    !versionMismatch &&
    !stalePricing &&
    lastSync !== null &&
    Date.now() - lastSync < SYNC_THROTTLE_MS
  ) {
    log.info(`OpenRouter sync skipped, last sync was less than ${SYNC_THROTTLE_HOURS}h ago`)
    return
  }

  if (versionMismatch) {
    log.info(
      `OpenRouter sync forced, version changed (stored: ${storedVersion}, current: ${SYNC_VERSION})`,
    )
  }
  if (stalePricing) {
    log.info('OpenRouter sync forced, stale pricing data detected')
  }

  const res = await fetch(OPENROUTER_MODELS_URL)
  if (!res.ok) {
    throw new Error(`OpenRouter models fetch failed: ${res.status}`)
  }

  const body = OpenRouterModelsResponse.parse(await res.json())

  // Parse entries one at a time so a single malformed row can't abort the sync.
  const allModels: OpenRouterModel[] = []
  for (const entry of body.data) {
    const parsed = OpenRouterModel.safeParse(entry)
    if (parsed.success) {
      allModels.push(parsed.data)
    }
  }

  const skipped = body.data.length - allModels.length
  if (skipped > 0) {
    log.warn(`OpenRouter sync skipped ${skipped} malformed catalog entries`)
  }

  for (const m of allModels) {
    upsertSyncedModel(mapToRow(m))
  }

  const disabledMissing = reconcileMissingModels(allModels.map((m) => m.id))
  if (disabledMissing.length > 0) {
    log.warn(
      `OpenRouter sync disabled ${disabledMissing.length} enabled model(s) no longer in the catalog: ${disabledMissing.join(', ')}`,
    )
  }

  setSyncState(Date.now(), SYNC_VERSION)
  log.info(`OpenRouter sync complete: ${allModels.length} models synced`)
  onSynced?.()
}
