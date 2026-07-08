import { randomUUID } from 'crypto';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import {
  type MemoryScope,
  MemorySliceDTO,
  type MemorySource,
  type UpsertMemorySliceInput,
} from '../../../shared-contracts/schemas/memory-slice.schema';
import { db } from '../../core/db/client';
import { memorySlices } from '../../core/db/schema';

function projectIdCond(projectId: string | null | undefined): SQL {
  return projectId != null ? eq(memorySlices.projectId, projectId) : isNull(memorySlices.projectId);
}

// One slice looked up by its natural key (scope + project + title). Shared by the upsert's
// title-match branch and the by-title read/delete so the three-part where clause lives once.
function sliceByTitle(
  scope: MemoryScope,
  projectId: string | null | undefined,
  title: string,
): typeof memorySlices.$inferSelect | undefined {
  return db
    .select()
    .from(memorySlices)
    .where(
      and(eq(memorySlices.scope, scope), projectIdCond(projectId), eq(memorySlices.title, title)),
    )
    .get();
}

function rowToDTO(row: typeof memorySlices.$inferSelect): MemorySliceDTO {
  return MemorySliceDTO.parse({
    id: row.id,
    scope: row.scope,
    projectId: row.projectId ?? null,
    title: row.title,
    content: row.content,
    source: row.source,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });
}

export function listSlices(scope: MemoryScope, projectId?: string | null): MemorySliceDTO[] {
  const conditions =
    scope === 'global'
      ? eq(memorySlices.scope, 'global')
      : and(eq(memorySlices.scope, 'project'), projectIdCond(projectId));

  return db.select().from(memorySlices).where(conditions).all().map(rowToDTO);
}

// Upsert precedence: an explicit id updates that row; else a same-title slice in the same
// scope is updated; else insert. The title-match branch deliberately leaves the title as-is.
export function upsertSlice(input: UpsertMemorySliceInput): MemorySliceDTO {
  const now = new Date();

  if (input.id) {
    const existing = db.select().from(memorySlices).where(eq(memorySlices.id, input.id)).get();

    if (existing) {
      const updated = db
        .update(memorySlices)
        .set({
          title: input.title,
          content: input.content,
          source: input.source ?? existing.source,
          updatedAt: now,
        })
        .where(eq(memorySlices.id, input.id))
        .returning()
        .get();

      if (!updated) {
        throw new Error(`upsertSlice: update returned no row for id ${input.id}`);
      }

      return rowToDTO(updated);
    }
  }

  const byTitle = sliceByTitle(input.scope, input.projectId, input.title);

  if (byTitle) {
    const updated = db
      .update(memorySlices)
      .set({
        content: input.content,
        source: input.source ?? byTitle.source,
        updatedAt: now,
      })
      .where(eq(memorySlices.id, byTitle.id))
      .returning()
      .get();

    if (!updated) {
      throw new Error(`upsertSlice: update returned no row for id ${byTitle.id}`);
    }

    return rowToDTO(updated);
  }

  const inserted = db
    .insert(memorySlices)
    .values({
      id: input.id ?? randomUUID(),
      scope: input.scope,
      projectId: input.projectId ?? null,
      title: input.title,
      content: input.content,
      source: input.source ?? 'user',
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  if (!inserted) {
    throw new Error('upsertSlice: insert returned no row');
  }

  return rowToDTO(inserted);
}

export function deleteSlice(id: string): { scope: MemoryScope; projectId: string | null } | null {
  const row = db.select().from(memorySlices).where(eq(memorySlices.id, id)).get();

  if (!row) {
    return null;
  }

  db.delete(memorySlices).where(eq(memorySlices.id, id)).run();

  return { scope: row.scope, projectId: row.projectId ?? null };
}

export function readByTitle(
  scope: MemoryScope,
  projectId: string | null,
  title: string,
): MemorySliceDTO | undefined {
  const row = sliceByTitle(scope, projectId, title);
  return row ? rowToDTO(row) : undefined;
}

export function writeByTitle(
  scope: MemoryScope,
  projectId: string | null,
  title: string,
  content: string,
  source: MemorySource = 'model',
): MemorySliceDTO {
  return upsertSlice({ scope, projectId, title, content, source });
}

export function deleteByTitle(scope: MemoryScope, projectId: string | null, title: string): void {
  const row = sliceByTitle(scope, projectId, title);

  if (row) {
    db.delete(memorySlices).where(eq(memorySlices.id, row.id)).run();
  }
}
