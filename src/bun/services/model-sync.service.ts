import { and, eq, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { ProviderId } from '../../shared-contracts/providers/registry';
import type { ModelCapabilities } from '../../shared-contracts/schemas/model.schema';
import { db, sqlite } from '../db/client';
import { ModelSource } from '../db/model-source';
import { models } from '../db/schema';
import { log } from '../logging/logger';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const SYNC_THROTTLE_HOURS = 24;
const SYNC_THROTTLE_MS = SYNC_THROTTLE_HOURS * 60 * 60 * 1000;
const SETTINGS_KEY = 'openrouter_sync';
// Bump when sync logic or schema changes to force a re-sync on next startup.
const SYNC_VERSION = 2;
// Fallback when OpenRouter does not report a model's max output tokens.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

// Tokens OpenRouter advertises in a model's supported_parameters / input_modalities.
// Named here so the capability mapping reads against its vocabulary, not bare strings.
const OPENROUTER_PARAM = {
  reasoning: 'reasoning',
  includeReasoning: 'include_reasoning',
  tools: 'tools',
} as const;
const OPENROUTER_MODALITY = {
  image: 'image',
  file: 'file',
} as const;

// One entry of the OpenRouter catalog. Parsed per item at the network boundary so a
// malformed row is skipped, not fatal to the whole sync.
const OpenRouterModel = z.object({
  id: z.string(),
  name: z.string(),
  pricing: z.object({ prompt: z.string(), completion: z.string() }),
  architecture: z.object({ input_modalities: z.array(z.string()).optional() }).optional(),
  supported_parameters: z.array(z.string()).optional(),
  context_length: z.number().optional(),
  top_provider: z
    .object({
      max_completion_tokens: z.number().optional(),
      context_length: z.number().optional(),
    })
    .optional(),
});
type OpenRouterModel = z.infer<typeof OpenRouterModel>;

const OpenRouterModelsResponse = z.object({ data: z.array(z.unknown()) });

// Family groups a synced model by its OpenRouter vendor prefix, so "google/gemma-2-9b" lands under "google".
function deriveFamily(id: string): string {
  return id.split('/')[0] ?? 'unknown';
}

// Convert one entry from the OpenRouter catalog into a models table row.
function mapToRow(m: OpenRouterModel) {
  const modalities = m.architecture?.input_modalities ?? [];
  const params = m.supported_parameters ?? [];
  const maxOutputTokens = m.top_provider?.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const contextWindow = m.top_provider?.context_length ?? m.context_length;

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
  };

  const pricing = {
    prompt: Number(m.pricing.prompt) || 0,
    completion: Number(m.pricing.completion) || 0,
  };

  return {
    id: m.id,
    provider: ProviderId.enum.openrouter,
    family: deriveFamily(m.id),
    displayName: m.name,
    capabilities,
    pricing,
    isCustom: false,
    source: ModelSource.enum.openrouter,
  };
}

type SyncState = {
  ts: number | null;
  version: number;
};

// Persisted sync marker. Legacy rows stored a bare timestamp before the versioned object.
const SyncStateBlob = z.union([
  z.number(),
  z.object({ ts: z.number().nullable().optional(), version: z.number().optional() }),
]);

function getSyncState(): SyncState {
  const row = sqlite
    .query<{ value: string }, [string]>(`SELECT value FROM settings WHERE key = ?`)
    .get(SETTINGS_KEY);
  if (!row) {
    return { ts: null, version: 0 };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(row.value);
  } catch {
    return { ts: null, version: 0 };
  }

  const parsed = SyncStateBlob.safeParse(raw);
  if (!parsed.success) {
    return { ts: null, version: 0 };
  }

  if (typeof parsed.data === 'number') {
    return { ts: parsed.data, version: 0 };
  }

  return { ts: parsed.data.ts ?? null, version: parsed.data.version ?? 0 };
}

function setSyncState(ts: number): void {
  sqlite
    .query(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(SETTINGS_KEY, JSON.stringify({ ts, version: SYNC_VERSION }));
}

export function getLastSyncTimestamp(): number | null {
  return getSyncState().ts;
}

// True when any synced OpenRouter row is missing pricing, used to force a re-sync.
function hasStaleOrNullPricing(): boolean {
  const row = sqlite
    .query<{ n: number }, [string]>(
      `SELECT COUNT(*) as n FROM models WHERE source = ? AND pricing IS NULL`,
    )
    .get(ModelSource.enum.openrouter);
  return (row?.n ?? 0) > 0;
}

export async function syncOpenRouterModels(onSynced?: () => void, force = false): Promise<void> {
  const { ts: lastSync, version: storedVersion } = getSyncState();
  const versionMismatch = storedVersion !== SYNC_VERSION;
  const stalePricing = hasStaleOrNullPricing();

  // Skip when a recent sync already ran, unless forced, the sync version changed,
  // or stored pricing is stale.
  if (
    !force &&
    !versionMismatch &&
    !stalePricing &&
    lastSync !== null &&
    Date.now() - lastSync < SYNC_THROTTLE_MS
  ) {
    log.info(`OpenRouter sync skipped, last sync was less than ${SYNC_THROTTLE_HOURS}h ago`);
    return;
  }

  if (versionMismatch) {
    log.info(
      `OpenRouter sync forced, version changed (stored: ${storedVersion}, current: ${SYNC_VERSION})`,
    );
  }
  if (stalePricing) {
    log.info('OpenRouter sync forced, stale pricing data detected');
  }

  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) {
    throw new Error(`OpenRouter models fetch failed: ${res.status}`);
  }

  const body = OpenRouterModelsResponse.parse(await res.json());

  // Parse entries one at a time so a single malformed row can't abort the sync.
  const allModels: OpenRouterModel[] = [];
  for (const entry of body.data) {
    const parsed = OpenRouterModel.safeParse(entry);
    if (parsed.success) {
      allModels.push(parsed.data);
    }
  }

  const skipped = body.data.length - allModels.length;
  if (skipped > 0) {
    log.warn(`OpenRouter sync skipped ${skipped} malformed catalog entries`);
  }

  const now = new Date();
  const incomingIds = new Set(allModels.map((m) => m.id));

  for (const m of allModels) {
    const row = mapToRow(m);
    const existing = db.select().from(models).where(eq(models.id, row.id)).get();

    // New model: insert disabled so the user opts in from the marketplace.
    if (!existing) {
      db.insert(models)
        .values({ ...row, isEnabled: false, createdAt: now, updatedAt: now })
        .run();
      continue;
    }

    // Only the catalog sync owns openrouter rows. Leave builtin rows untouched.
    if (existing.source !== ModelSource.enum.openrouter) {
      continue;
    }

    // Refresh metadata only. Never touch isEnabled, that is the user's choice.
    db.update(models)
      .set({
        displayName: row.displayName,
        capabilities: row.capabilities,
        pricing: row.pricing,
        updatedAt: now,
      })
      .where(eq(models.id, row.id))
      .run();
  }

  // Prune only rows the catalog dropped that are still disabled.
  // Never delete a model the user enabled.
  const incomingIdList = [...incomingIds];
  if (incomingIdList.length > 0) {
    db.delete(models)
      .where(
        and(
          eq(models.source, ModelSource.enum.openrouter),
          eq(models.isEnabled, false),
          notInArray(models.id, incomingIdList),
        ),
      )
      .run();
  }

  setSyncState(Date.now());
  log.info(`OpenRouter sync complete: ${allModels.length} models synced`);
  onSynced?.();
}
