import { randomUUID } from 'crypto';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type {
  MemorySliceDTO,
  UpsertMemorySliceInput,
} from '../../shared-contracts/schemas/memory-slice.schema';
import { db } from '../db/client';
import { memorySlices } from '../db/schema';

function projectIdCond(projectId: string | null | undefined): SQL {
  return projectId != null ? eq(memorySlices.projectId, projectId) : isNull(memorySlices.projectId);
}

function rowToDTO(row: typeof memorySlices.$inferSelect): MemorySliceDTO {
  return {
    id: row.id,
    scope: row.scope,
    projectId: row.projectId ?? null,
    title: row.title,
    content: row.content,
    source: row.source,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function listSlices(
  scope: 'global' | 'project',
  projectId?: string | null,
): MemorySliceDTO[] {
  const conditions =
    scope === 'global'
      ? eq(memorySlices.scope, 'global')
      : and(eq(memorySlices.scope, 'project'), projectIdCond(projectId));

  return db.select().from(memorySlices).where(conditions).all().map(rowToDTO);
}

export function upsertSlice(input: UpsertMemorySliceInput): MemorySliceDTO {
  const now = new Date();

  if (input.id) {
    const existing = db.select().from(memorySlices).where(eq(memorySlices.id, input.id)).get();
    if (existing) {
      db.update(memorySlices)
        .set({
          title: input.title,
          content: input.content,
          source: input.source ?? existing.source,
          updatedAt: now,
        })
        .where(eq(memorySlices.id, input.id))
        .run();
      return rowToDTO(db.select().from(memorySlices).where(eq(memorySlices.id, input.id)).get()!);
    }
  }

  const byTitle = db
    .select()
    .from(memorySlices)
    .where(
      and(
        eq(memorySlices.scope, input.scope),
        projectIdCond(input.projectId),
        eq(memorySlices.title, input.title),
      ),
    )
    .get();

  if (byTitle) {
    db.update(memorySlices)
      .set({
        content: input.content,
        source: input.source ?? byTitle.source,
        updatedAt: now,
      })
      .where(eq(memorySlices.id, byTitle.id))
      .run();
    return rowToDTO(db.select().from(memorySlices).where(eq(memorySlices.id, byTitle.id)).get()!);
  }

  const id = input.id ?? randomUUID();
  db.insert(memorySlices)
    .values({
      id,
      scope: input.scope,
      projectId: input.projectId ?? null,
      title: input.title,
      content: input.content,
      source: input.source ?? 'user',
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return rowToDTO(db.select().from(memorySlices).where(eq(memorySlices.id, id)).get()!);
}

export function deleteSlice(
  id: string,
): { scope: 'global' | 'project'; projectId: string | null } | null {
  const row = db.select().from(memorySlices).where(eq(memorySlices.id, id)).get();
  if (!row) return null;
  db.delete(memorySlices).where(eq(memorySlices.id, id)).run();
  return { scope: row.scope, projectId: row.projectId ?? null };
}

export function readByTitle(
  scope: 'global' | 'project',
  projectId: string | null,
  title: string,
): MemorySliceDTO | undefined {
  const row = db
    .select()
    .from(memorySlices)
    .where(
      and(eq(memorySlices.scope, scope), projectIdCond(projectId), eq(memorySlices.title, title)),
    )
    .get();
  return row ? rowToDTO(row) : undefined;
}

export function writeByTitle(
  scope: 'global' | 'project',
  projectId: string | null,
  title: string,
  content: string,
  source: 'user' | 'model' = 'model',
): MemorySliceDTO {
  return upsertSlice({ scope, projectId, title, content, source });
}

export function deleteByTitle(
  scope: 'global' | 'project',
  projectId: string | null,
  title: string,
): void {
  const row = db
    .select()
    .from(memorySlices)
    .where(
      and(eq(memorySlices.scope, scope), projectIdCond(projectId), eq(memorySlices.title, title)),
    )
    .get();
  if (row) {
    db.delete(memorySlices).where(eq(memorySlices.id, row.id)).run();
  }
}
