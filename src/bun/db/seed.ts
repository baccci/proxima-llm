import { eq } from 'drizzle-orm';
import { db } from './client';
import { MODEL_SEED } from './model-seed';
import { ModelSource } from './model-source';
import { models } from './schema';

// Insert the models we ship on first boot, and refresh them on later boots.
export async function seedModels() {
  const now = new Date();

  for (const def of MODEL_SEED) {
    // Check if this model is already in the database.
    const existing = db.select().from(models).where(eq(models.id, def.id)).get();

    // Not stored yet, so add it as a built in model.
    if (!existing) {
      db.insert(models)
        .values({
          ...def,
          source: ModelSource.enum.builtin,
          capabilities: def.capabilities as unknown as string,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      continue;
    }

    // Refresh built-in specs each boot; leave user- and openrouter-sourced rows untouched.
    if (existing.source !== ModelSource.enum.builtin) {
      continue;
    }

    db.update(models)
      .set({
        capabilities: def.capabilities as unknown as string,
        displayName: def.displayName,
        updatedAt: now,
      })
      .where(eq(models.id, def.id))
      .run();
  }
}
