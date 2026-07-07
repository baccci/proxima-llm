import { eq } from 'drizzle-orm';
import { type ModelDefinition, ModelDTO } from '../../shared-contracts/schemas/model.schema';
import { db } from '../db/client';
import { models } from '../db/schema';

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
