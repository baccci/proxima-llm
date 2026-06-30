import { and, eq, notInArray } from 'drizzle-orm';
import { db, sqlite } from '../db/client';
import { models } from '../db/schema';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const SYNC_THROTTLE_MS = 24 * 60 * 60 * 1000; // 24 hours
const SETTINGS_KEY = 'openrouter_sync';
// Bump when sync logic or schema changes to force a re-sync on next startup.
const SYNC_VERSION = 2;

interface OpenRouterModel {
  id: string;
  name: string;
  pricing: { prompt: string; completion: string };
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
  context_length?: number;
  top_provider?: { max_completion_tokens?: number; context_length?: number };
}

function deriveFamily(id: string): string {
  const vendor = id.split('/')[0] ?? 'unknown';
  const modelSlug = id.split('/')[1] ?? '';
  for (const token of [
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
  ]) {
    if (modelSlug.toLowerCase().includes(token)) return token;
  }
  return vendor;
}

function mapToRow(m: OpenRouterModel): {
  id: string;
  provider: string;
  family: string;
  displayName: string;
  capabilities: string;
  pricing: string;
  isCustom: boolean;
  source: 'openrouter';
} {
  const modalities = m.architecture?.input_modalities ?? [];
  const params = m.supported_parameters ?? [];
  const maxOutputTokens = m.top_provider?.max_completion_tokens ?? 8192;
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
    provider: 'openrouter',
    family: deriveFamily(m.id),
    displayName: m.name,
    capabilities: capabilities as unknown as string,
    pricing: pricing as unknown as string,
    isCustom: false,
    source: 'openrouter',
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

function hasStaleOrNullPricing(): boolean {
  const row = sqlite
    .query<{ n: number }, []>(
      `SELECT COUNT(*) as n FROM models WHERE source = 'openrouter' AND pricing IS NULL`,
    )
    .get();
  return (row?.n ?? 0) > 0;
}

export async function syncOpenRouterModels(onSynced?: () => void, force = false): Promise<void> {
  const { ts: lastSync, version: storedVersion } = getSyncState();
  const versionMismatch = storedVersion !== SYNC_VERSION;
  const stalePricing = hasStaleOrNullPricing();

  if (
    !force &&
    !versionMismatch &&
    !stalePricing &&
    lastSync !== null &&
    Date.now() - lastSync < SYNC_THROTTLE_MS
  ) {
    console.log('OpenRouter sync skipped — last sync was less than 24h ago');
    return;
  }

  if (versionMismatch)
    console.log(
      `OpenRouter sync forced — version changed (stored: ${storedVersion}, current: ${SYNC_VERSION})`,
    );
  if (stalePricing) console.log('OpenRouter sync forced — stale pricing data detected');

  const res = await fetch(OPENROUTER_MODELS_URL);
  if (!res.ok) throw new Error(`OpenRouter models fetch failed: ${res.status}`);

  const json = (await res.json()) as { data: OpenRouterModel[] };
  const allModels = json.data;

  const now = new Date();
  const incomingIds = new Set(allModels.map((m) => m.id));

  for (const m of allModels) {
    const row = mapToRow(m);
    const existing = db.select().from(models).where(eq(models.id, row.id)).get();

    if (!existing) {
      // New model: insert as disabled (opt-in)
      db.insert(models)
        .values({ ...row, isEnabled: false, createdAt: now, updatedAt: now })
        .run();
    } else if (existing.source === 'openrouter') {
      // Existing model: update metadata only — never touch isEnabled
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
  }

  // Prune only absent + disabled openrouter rows (never delete user-enabled models)
  const incomingIdList = [...incomingIds];
  if (incomingIdList.length > 0) {
    db.delete(models)
      .where(
        and(
          eq(models.source, 'openrouter'),
          eq(models.isEnabled, false),
          notInArray(models.id, incomingIdList),
        ),
      )
      .run();
  }

  setSyncState(Date.now());
  console.log(`OpenRouter sync complete — ${allModels.length} models synced`);
  onSynced?.();
}
