import { compareEffort, Effort } from '@shared/models/effort'
import { ProviderId } from '@shared/providers/registry'
import type { ModelCapabilities } from '@shared/schemas/model.schema'
import { z } from 'zod'
import { ModelSource } from '../../infra/db/model-source'
import { getApiKey } from '../../infra/keychain'
import { log } from '../../infra/logging/logger'
import {
  getSyncState,
  reconcileMissingModels,
  type SyncedModelRow,
  setSyncState,
  upsertSyncedModel,
} from './model.repository'

const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models'
// Required on every Anthropic REST call; pins the wire schema.
const ANTHROPIC_VERSION = '2023-06-01'
// This sync's own marker key in the shared settings table.
const ANTHROPIC_SYNC_KEY = 'anthropic_sync'
const SYNC_THROTTLE_HOURS = 24
const SYNC_THROTTLE_MS = SYNC_THROTTLE_HOURS * 60 * 60 * 1000
// Bump when sync logic or the capability mapping changes to force a re-sync on next start.
const SYNC_VERSION = 1
// Fallback when the API omits a model's max output tokens (Anthropic always reports it).
const DEFAULT_MAX_OUTPUT_TOKENS = 8192
// Anthropic's list endpoint page size.
const PAGE_LIMIT = 1000

// Family tokens the id scan recognises. Scanned across all id segments (not positional):
// modern ids are `claude-<family>-<version>`, but legacy ids like
// `claude-3-5-sonnet-20241022` carry the family later, where a positional split derives `3`.
const KNOWN_FAMILIES = ['opus', 'sonnet', 'haiku', 'fable', 'mythos'] as const
// The tiers whose newest member inserts enabled. Legacy and premium families stay disabled.
const CORE_FAMILIES = ['opus', 'sonnet', 'haiku'] as const

// Fields the API capability tree does not expose get an Anthropic-wide default plus this
// tiny per-family exception table (matching the retired seed). If a future /v1/models
// response exposes these leaves, derive them from the tree instead and shrink this table.
const FAMILY_CAP_OVERRIDES: Record<string, { pdf?: boolean; webSearch?: boolean }> = {
  haiku: { pdf: false, webSearch: false },
}

// One entry of the Anthropic catalog. capabilities is left as unknown and read through the
// defensive leafSupported walker, so a shape change can't reject an otherwise-valid model;
// a genuinely malformed entry (no id / display_name) is skipped and counted by the fetch.
const AnthropicModel = z.object({
  id: z.string(),
  display_name: z.string(),
  created_at: z.string().optional(),
  max_input_tokens: z.number().optional(),
  max_tokens: z.number().optional(),
  capabilities: z.unknown().optional(),
})
export type AnthropicModel = z.infer<typeof AnthropicModel>

const AnthropicModelsResponse = z.object({
  data: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  last_id: z.string().nullable().optional(),
})

// Walk the capability tree to a `{ supported: boolean }` leaf, returning false for any
// missing branch. The API reports capabilities as nested `{ supported }` leaves, e.g.
// capabilities.thinking.types.adaptive.supported.
function leafSupported(caps: unknown, path: readonly string[]): boolean {
  let node: unknown = caps
  for (const key of path) {
    if (typeof node !== 'object' || node === null) {
      return false
    }
    node = (node as Record<string, unknown>)[key]
  }
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as Record<string, unknown>).supported === true
  )
}

// The effort tiers the tree marks supported, filtered to our Effort vocabulary and ordered
// low→high (same filter/sort shape as OpenRouter's mapReasoning).
function deriveEfforts(caps: unknown): Effort[] {
  const efforts: Effort[] = []
  for (const level of Effort.options) {
    if (leafSupported(caps, ['effort', level])) {
      efforts.push(level)
    }
  }
  efforts.sort(compareEffort)
  return efforts
}

// The API publishes no default effort, so pick one deterministically: medium when the model
// supports it, else the lowest supported tier, else null (a non-reasoning model).
export function deriveDefaultEffort(efforts: Effort[]): Effort | null {
  if (efforts.includes(Effort.enum.medium)) {
    return Effort.enum.medium
  }
  return efforts[0] ?? null
}

// Group a model by scanning its id segments for a known family token, falling back to a
// segment-based best guess for unknown shapes.
export function deriveFamily(id: string): string {
  const segments = id.split('-')
  for (const segment of segments) {
    if ((KNOWN_FAMILIES as readonly string[]).includes(segment)) {
      return segment
    }
  }
  return segments[1] ?? id
}

function mapCapabilities(entry: AnthropicModel): ModelCapabilities {
  const caps = entry.capabilities
  const efforts = deriveEfforts(caps)
  const overrides = FAMILY_CAP_OVERRIDES[deriveFamily(entry.id)] ?? {}

  return {
    thinking: leafSupported(caps, ['thinking', 'types', 'adaptive']),
    reasoningMandatory: false,
    efforts,
    defaultEffort: deriveDefaultEffort(efforts),
    vision: leafSupported(caps, ['image_input']),
    pdf: overrides.pdf ?? true,
    tools: true,
    promptCaching: true,
    webSearch: overrides.webSearch ?? true,
    maxOutputTokens: entry.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(entry.max_input_tokens !== undefined ? { contextWindow: entry.max_input_tokens } : {}),
  }
}

// Convert one catalog entry into a persistable row. Anthropic pricing is intentionally null
// (not in the API); the title-model resolver handles unpriced Anthropic via its haiku hint.
export function mapToRow(entry: AnthropicModel): SyncedModelRow {
  return {
    id: entry.id,
    provider: ProviderId.enum.anthropic,
    family: deriveFamily(entry.id),
    displayName: entry.display_name,
    capabilities: mapCapabilities(entry),
    pricing: null,
    source: ModelSource.enum.anthropic,
  }
}

function createdAtMs(entry: AnthropicModel): number {
  const ms = entry.created_at ? Date.parse(entry.created_at) : Number.NaN
  return Number.isNaN(ms) ? 0 : ms
}

// The ids that insert enabled: the newest (latest created_at) member of each core family.
// A tie keeps the first-seen id. Only these fire the insert-enabled path; every other model
// inserts disabled, and once a row exists the user owns its enabled state.
export function selectNewestPerFamily(entries: AnthropicModel[]): Set<string> {
  const newest = new Map<string, AnthropicModel>()
  for (const entry of entries) {
    const family = deriveFamily(entry.id)
    if (!(CORE_FAMILIES as readonly string[]).includes(family)) {
      continue
    }
    const current = newest.get(family)
    if (!current || createdAtMs(entry) > createdAtMs(current)) {
      newest.set(family, entry)
    }
  }
  return new Set([...newest.values()].map((entry) => entry.id))
}

// Fetch the full catalog, following has_more / last_id pagination. Parses the envelope, then
// safeParses each entry so one malformed row is skipped (and counted), never fatal.
async function fetchAllModels(apiKey: string): Promise<AnthropicModel[]> {
  const all: AnthropicModel[] = []
  let skipped = 0
  let afterId: string | null = null

  for (;;) {
    const url = new URL(ANTHROPIC_MODELS_URL)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    if (afterId !== null) {
      url.searchParams.set('after_id', afterId)
    }

    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION },
    })
    if (!res.ok) {
      throw new Error(`Anthropic models fetch failed: ${res.status}`)
    }

    const body = AnthropicModelsResponse.parse(await res.json())
    for (const item of body.data) {
      const parsed = AnthropicModel.safeParse(item)
      if (parsed.success) {
        all.push(parsed.data)
      } else {
        skipped++
      }
    }

    if (!body.has_more || !body.last_id) {
      break
    }
    afterId = body.last_id
  }

  if (skipped > 0) {
    log.warn(`Anthropic sync skipped ${skipped} malformed catalog entries`)
  }
  return all
}

export function getAnthropicLastSyncTimestamp(): number | null {
  return getSyncState(ANTHROPIC_SYNC_KEY).ts
}

export async function syncAnthropicModels(onSynced?: () => void, force = false): Promise<void> {
  const { ts: lastSync, version: storedVersion } = getSyncState(ANTHROPIC_SYNC_KEY)
  const versionMismatch = storedVersion !== SYNC_VERSION

  // Skip when a recent sync already ran, unless forced or the sync version changed. No
  // stale-pricing trigger: Anthropic pricing is intentionally null, so a stale check would
  // force a re-sync forever.
  if (!force && !versionMismatch && lastSync !== null && Date.now() - lastSync < SYNC_THROTTLE_MS) {
    log.info(`Anthropic sync skipped, last sync was less than ${SYNC_THROTTLE_HOURS}h ago`)
    return
  }

  if (versionMismatch) {
    log.info(
      `Anthropic sync forced, version changed (stored: ${storedVersion}, current: ${SYNC_VERSION})`,
    )
  }

  // No key, no Claude models: the API is the only source of the Anthropic catalog and it
  // needs a key. Skip quietly; a later key-save kicks a forced sync.
  const apiKey = getApiKey(ProviderId.enum.anthropic)
  if (apiKey === undefined) {
    log.info('Anthropic sync skipped, no API key configured')
    return
  }

  const catalog = await fetchAllModels(apiKey)
  const enableSet = selectNewestPerFamily(catalog)

  for (const model of catalog) {
    upsertSyncedModel(mapToRow(model), enableSet.has(model.id))
  }

  const disabledMissing = reconcileMissingModels(
    catalog.map((model) => model.id),
    ModelSource.enum.anthropic,
  )
  if (disabledMissing.length > 0) {
    log.warn(
      `Anthropic sync disabled ${disabledMissing.length} enabled model(s) no longer listed: ${disabledMissing.join(', ')}`,
    )
  }

  setSyncState(ANTHROPIC_SYNC_KEY, Date.now(), SYNC_VERSION)
  log.info(`Anthropic sync complete: ${catalog.length} models synced`)
  onSynced?.()
}
