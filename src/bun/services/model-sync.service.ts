import { and, eq, notInArray } from 'drizzle-orm';
import { ProviderId } from '../../shared-contracts/providers/registry';
import type { ModelCapabilities } from '../../shared-contracts/schemas/model.schema';
import { db, sqlite } from '../db/client';
import { ModelSource } from '../db/model-source';
import { models } from '../db/schema';
import { log } from '../logging/logger';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const SYNC_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SETTINGS_KEY = 'openrouter_sync';
// Bump when sync logic or schema changes to force a re-sync on next startup.
const SYNC_VERSION = 2;
// Fallback when OpenRouter does not report a model's max output tokens.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
// Vendor tokens we look for in a model slug to group it into a family.
const FAMILY_TOKENS = [
  'gemma',
  'gemini',
  'llama',
  'mistral',
  'nemotron',
  'qwen',
  'deepseek',
  'phi',
  'falcon',
  'mixtral',
  'command',
];

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
  context_length?: number;
  top_provider?: { max_completion_tokens?: number; context_length?: number };
}

// Guess a model family from its OpenRouter id like "google/gemma-2-9b".
// Match a known vendor token in the slug, else fall back to the vendor prefix.
function deriveFamily(id: string): string {
  const vendor = id.split('/')[0] ?? 'unknown';
  const modelSlug = id.split('/')[1] ?? '';
  for (const token of FAMILY_TOKENS) {
    if (modelSlug.toLowerCase().includes(token)) return token;
  }
  return vendor;
}

// Convert one entry from the OpenRouter catalog into a models table row.
function mapToRow(m: OpenRouterModel): {
  id: string;
  provider: string;
  family: string;
  displayName: string;
  capabilities: ModelCapabilities;
  pricing: { prompt: number; completion: number };
  isCustom: boolean;
  source: 'openrouter';
} {
  const modalities = m.architecture?.input_modalities ?? [];
  const params = m.supported_parameters ?? [];
  const maxOutputTokens = m.top_provider?.max_completion_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const contextWindow = m.top_provider?.context_length ?? m.context_length;

  const capabilities = {
    thinking: params.includes('reasoning') || params.includes('include_reasoning'),
    vision: modalities.includes('image'),
    pdf: modalities.includes('file'),
    tools: params.includes('tools'),
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

interface SyncState {
  ts: number | null;
  version: number;
}

function getSyncState(): SyncState {
  const row = sqlite
    .query<{ value: string }, [string]>(`SELECT value FROM settings WHERE key = ?`)
    .get(SETTINGS_KEY);
  if (!row) return { ts: null, version: 0 };
  try {
    const parsed = JSON.parse(row.value);
    if (typeof parsed === 'number') return { ts: parsed, version: 0 };
    if (parsed && typeof parsed === 'object') {
      return { ts: parsed.ts ?? null, version: parsed.version ?? 0 };
    }
    return { ts: null, version: 0 };
  } catch {
    return { ts: null, version: 0 };
  }
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
    .query<{ n: number }, []>(
      `SELECT COUNT(*) as n FROM models WHERE source = '${ModelSource.enum.openrouter}' AND pricing IS NULL`,
    )
    .get();
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
    log.info('OpenRouter sync skipped, last sync was less than 24h ago');
    return;
  }

  if (versionMismatch)
    log.info(
      `OpenRouter sync forced, version changed (stored: ${storedVersion}, current: ${SYNC_VERSION})`,
    );
  if (stalePricing) log.info('OpenRouter sync forced, stale pricing data detected');

  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);

  const json = (await res.json()) as { data: OpenRouterModel[] };
  const allModels = json.data;

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
