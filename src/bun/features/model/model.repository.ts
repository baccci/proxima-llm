import { and, count, eq, isNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { type ModelDefinition, ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import { db } from '../../core/db/client';
import { ModelSource } from '../../core/db/model-source';
import { models, settings } from '../../core/db/schema';

// The model aggregate's data layer: the only place that queries the models table
// (and its openrouter_sync marker) and parses rows into DTOs. model-sync orchestrates
// the catalog fetch and calls in here for every read and write. Rename to
// model.repository.ts rides the features/ move (A1).

// Turn a raw database row into the model shape the renderer trusts.
// parse validates the row at this boundary, so a bad provider or malformed
// capabilities fails loudly here instead of leaking a wrong type into the UI.
function rowToDTO(row: typeof models.$inferSelect): ModelDTO {
  return ModelDTO.parse({
    id: row.id,
    provider: row.provider,
    family: row.family,
    displayName: row.displayName,
    capabilities: row.capabilities,
    isEnabled: row.isEnabled,
    pricing: row.pricing ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });
}

// Read every model in the catalog.
export function listModels(): ModelDTO[] {
  return db.select().from(models).all().map(rowToDTO);
}

// Read one model by id, or undefined when it is not stored.
export function getModel(id: string): ModelDTO | undefined {
  const row = db.select().from(models).where(eq(models.id, id)).get();
  return row ? rowToDTO(row) : undefined;
}

// Apply a partial change to one model and return the updated row.
// returning() writes and reads back in a single query.
export function updateModel(id: string, patch: Partial<ModelDefinition>): ModelDTO {
  const row = db
    .update(models)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(models.id, id))
    .returning()
    .get();
  if (!row) {
    throw new Error(`updateModel: no model with id ${id}`);
  }

  return rowToDTO(row);
}

// --- OpenRouter sync persistence ------------------------------------------------
// model-sync builds these rows from the catalog; the write invariants live here so any
// future sync caller obeys them.

// One synced model ready to persist. Derived from the insert type so it can't drift
// from the schema; the writes below own isEnabled / createdAt / updatedAt.
export type SyncedModelRow = Omit<
  typeof models.$inferInsert,
  'isEnabled' | 'createdAt' | 'updatedAt'
>;

// Insert new catalog rows disabled so the user opts in from the marketplace, leave
// builtin rows the sync does not own untouched, and otherwise refresh metadata only.
// isEnabled is never changed on update: that is the user's choice.
export function upsertSyncedModel(row: SyncedModelRow): void {
  const existing = db.select().from(models).where(eq(models.id, row.id)).get();
  const now = new Date();

  if (!existing) {
    db.insert(models)
      .values({ ...row, isEnabled: false, createdAt: now, updatedAt: now })
      .run();
    return;
  }

  if (existing.source !== ModelSource.enum.openrouter) {
    return;
  }

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

// Prune only openrouter rows the catalog dropped that are still disabled; never delete
// a model the user enabled. An empty keep-set means the fetch yielded nothing, so skip
// the delete: a failed sync must not wipe the table.
export function pruneDisabledModelsMissing(keepIds: string[]): void {
  if (keepIds.length === 0) {
    return;
  }

  db.delete(models)
    .where(
      and(
        eq(models.source, ModelSource.enum.openrouter),
        eq(models.isEnabled, false),
        notInArray(models.id, keepIds),
      ),
    )
    .run();
}

// True when any synced openrouter row is missing pricing, used to force a re-sync.
export function hasStalePricing(): boolean {
  const row = db
    .select({ n: count() })
    .from(models)
    .where(and(eq(models.source, ModelSource.enum.openrouter), isNull(models.pricing)))
    .get();
  return (row?.n ?? 0) > 0;
}

// --- OpenRouter sync marker -----------------------------------------------------
// A single settings-table row (the model aggregate's slice of that shared key-value
// table) records when the last sync ran and under which logic version.

const SYNC_SETTINGS_KEY = 'openrouter_sync';

export type SyncState = {
  ts: number | null;
  version: number;
};

// Persisted marker. Legacy rows stored a bare timestamp before the versioned object.
const SyncStateBlob = z.union([
  z.number(),
  z.object({ ts: z.number().nullable().optional(), version: z.number().optional() }),
]);

export function getSyncState(): SyncState {
  let row: typeof settings.$inferSelect | undefined;
  try {
    row = db.select().from(settings).where(eq(settings.key, SYNC_SETTINGS_KEY)).get();
  } catch {
    // A corrupt marker blob must not crash the startup sync; treat it as never-synced.
    return { ts: null, version: 0 };
  }

  if (!row) {
    return { ts: null, version: 0 };
  }

  const parsed = SyncStateBlob.safeParse(row.value);
  if (!parsed.success) {
    return { ts: null, version: 0 };
  }

  if (typeof parsed.data === 'number') {
    return { ts: parsed.data, version: 0 };
  }

  return { ts: parsed.data.ts ?? null, version: parsed.data.version ?? 0 };
}

export function setSyncState(ts: number, version: number): void {
  db.insert(settings)
    .values({ key: SYNC_SETTINGS_KEY, value: { ts, version } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { ts, version } } })
    .run();
}
