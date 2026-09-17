import { type ModelDefinition, ModelDTO } from '@shared/schemas/model.schema'
import { and, count, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../infra/db/client'
import { ModelSource } from '../../infra/db/model-source'
import { models, settings } from '../../infra/db/schema'
import { planMissingModels } from './reconcile-missing-models'

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
  })
}

// Read every model in the catalog.
export function listModels(): ModelDTO[] {
  return db.select().from(models).all().map(rowToDTO)
}

// Read one model by id, or undefined when it is not stored.
export function getModel(id: string): ModelDTO | undefined {
  const row = db.select().from(models).where(eq(models.id, id)).get()
  return row ? rowToDTO(row) : undefined
}

// Apply a partial change to one model and return the updated row.
// returning() writes and reads back in a single query.
export function updateModel(id: string, patch: Partial<ModelDefinition>): ModelDTO {
  const row = db
    .update(models)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(models.id, id))
    .returning()
    .get()
  if (!row) {
    throw new Error(`updateModel: no model with id ${id}`)
  }

  return rowToDTO(row)
}

// --- Synced-model persistence ---------------------------------------------------
// Each provider's sync (anthropic, openrouter) builds these rows from its catalog; the
// write invariants live here so any sync caller obeys them.

// One synced model ready to persist. Derived from the insert type so it can't drift
// from the schema; the writes below own isEnabled / createdAt / updatedAt. The row's
// `source` names its owning sync.
export type SyncedModelRow = Omit<
  typeof models.$inferInsert,
  'isEnabled' | 'createdAt' | 'updatedAt'
>

// Insert a new catalog row, then only ever refresh metadata on later syncs. insertEnabled
// is the one deliberate write of isEnabled, and only on insert: OpenRouter inserts every
// row disabled (opt in from the marketplace), while the Anthropic sync inserts its curated
// newest-per-family rows enabled. A row a sync does not own (its source differs from the
// row's) is left untouched, so an Anthropic sync never reshapes an OpenRouter row or vice
// versa. isEnabled is never changed on update: that is the user's choice.
export function upsertSyncedModel(row: SyncedModelRow, insertEnabled = false): void {
  const existing = db.select().from(models).where(eq(models.id, row.id)).get()
  const now = new Date()

  if (!existing) {
    db.insert(models)
      .values({ ...row, isEnabled: insertEnabled, createdAt: now, updatedAt: now })
      .run()
    return
  }

  if (existing.source !== row.source) {
    return
  }

  db.update(models)
    .set({
      displayName: row.displayName,
      capabilities: row.capabilities,
      pricing: row.pricing,
      updatedAt: now,
    })
    .where(eq(models.id, row.id))
    .run()
}

// Reconcile one source's rows against its latest catalog. A row the source dropped no
// longer exists upstream (its endpoints are gone), so per planMissingModels a disabled
// one is deleted and an enabled one is only disabled: we never silently delete a model
// the user chose, but a dead model stops being offered to the title picker and the
// marketplace. The query is scoped to `source`, so each sync only reconciles its own rows.
// Returns the ids that were disabled so the caller can log them. An empty keep-set is a
// no-op: a failed sync must not wipe or disable the table.
export function reconcileMissingModels(keepIds: string[], source: ModelSource): string[] {
  const rows = db
    .select({ id: models.id, source: models.source, isEnabled: models.isEnabled })
    .from(models)
    .where(eq(models.source, source))
    .all()

  const plan = planMissingModels(rows, keepIds, source)

  if (plan.toDelete.length > 0) {
    db.delete(models).where(inArray(models.id, plan.toDelete)).run()
  }
  if (plan.toDisable.length > 0) {
    db.update(models)
      .set({ isEnabled: false, updatedAt: new Date() })
      .where(inArray(models.id, plan.toDisable))
      .run()
  }

  return plan.toDisable
}

// True when any synced openrouter row is missing pricing, used to force a re-sync.
export function hasStalePricing(): boolean {
  const row = db
    .select({ n: count() })
    .from(models)
    .where(and(eq(models.source, ModelSource.enum.openrouter), isNull(models.pricing)))
    .get()
  return (row?.n ?? 0) > 0
}

// --- Sync markers (per source) --------------------------------------------------
// Each syncable source keeps its own settings-table row (the model aggregate's slice of
// that shared key-value table) recording when its last sync ran and under which logic
// version. The caller supplies its key (e.g. 'openrouter_sync', 'anthropic_sync').

export type SyncState = {
  ts: number | null
  version: number
}

// Persisted marker. Legacy rows stored a bare timestamp before the versioned object.
const SyncStateBlob = z.union([
  z.number(),
  z.object({ ts: z.number().nullable().optional(), version: z.number().optional() }),
])

export function getSyncState(key: string): SyncState {
  let row: typeof settings.$inferSelect | undefined
  try {
    row = db.select().from(settings).where(eq(settings.key, key)).get()
  } catch {
    // A corrupt marker blob must not crash the startup sync; treat it as never-synced.
    return { ts: null, version: 0 }
  }

  if (!row) {
    return { ts: null, version: 0 }
  }

  const parsed = SyncStateBlob.safeParse(row.value)
  if (!parsed.success) {
    return { ts: null, version: 0 }
  }

  if (typeof parsed.data === 'number') {
    return { ts: parsed.data, version: 0 }
  }

  return { ts: parsed.data.ts ?? null, version: parsed.data.version ?? 0 }
}

export function setSyncState(key: string, ts: number, version: number): void {
  db.insert(settings)
    .values({ key, value: { ts, version } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { ts, version } } })
    .run()
}
