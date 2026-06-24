import { eq } from 'drizzle-orm';
import { MODEL_SEED } from '../../shared-contracts/models/seed';
import { db } from './client';
import { models } from './schema';

export async function seedModels() {
  const now = new Date();

  for (const def of MODEL_SEED) {
    const existing = db.select().from(models).where(eq(models.id, def.id)).get();

    if (!existing) {
      db.insert(models)
        .values({
          ...def,
          source: 'builtin',
          capabilities: def.capabilities as unknown as string,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } else if (existing.source === 'builtin') {
      // Update built-in model capabilities on each boot
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
}
