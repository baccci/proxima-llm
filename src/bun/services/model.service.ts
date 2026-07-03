import { eq } from 'drizzle-orm';
import type { ModelDefinition, ModelDTO } from '../../shared-contracts/schemas/model.schema';
import { db } from '../db/client';
import { models } from '../db/schema';

function rowToDTO(row: typeof models.$inferSelect): ModelDTO {
  return {
    id: row.id,
    provider: row.provider as ModelDTO['provider'],
    family: row.family,
    displayName: row.displayName,
    capabilities: row.capabilities as ModelDTO['capabilities'],
    isCustom: row.isCustom,
    isEnabled: row.isEnabled,
    pricing: (row.pricing as ModelDTO['pricing']) ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function listModels(): ModelDTO[] {
  return db.select().from(models).all().map(rowToDTO);
}

export function getModel(id: string): ModelDTO | undefined {
  const row = db.select().from(models).where(eq(models.id, id)).get();
  return row ? rowToDTO(row) : undefined;
}

export function createModel(def: ModelDefinition): ModelDTO {
  const now = new Date();
  db.insert(models)
    .values({
      ...def,
      source: 'custom',
      capabilities: def.capabilities as unknown as string,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return rowToDTO(db.select().from(models).where(eq(models.id, def.id)).get()!);
}

export function updateModel(id: string, patch: Partial<ModelDefinition>): ModelDTO {
  const now = new Date();
  db.update(models)
    .set({ ...patch, capabilities: patch.capabilities as unknown as string, updatedAt: now })
    .where(eq(models.id, id))
    .run();
  return rowToDTO(db.select().from(models).where(eq(models.id, id)).get()!);
}

export function deleteModel(id: string): void {
  db.delete(models).where(eq(models.id, id)).run();
}
