import {
  type CreateProjectInput,
  ProjectDTO,
  type UpdateProjectInput,
} from '@shared/schemas/project.schema'
import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '../../infra/db/client'
import { projects } from '../../infra/db/schema'

function rowToDTO(row: typeof projects.$inferSelect): ProjectDTO {
  return ProjectDTO.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}

export function getProject(id: string): ProjectDTO | undefined {
  const row = db.select().from(projects).where(eq(projects.id, id)).get()
  return row ? rowToDTO(row) : undefined
}

export function listProjects(): ProjectDTO[] {
  return db.select().from(projects).all().map(rowToDTO)
}

export function createProject(input: CreateProjectInput): ProjectDTO {
  const now = new Date()
  const inserted = db
    .insert(projects)
    .values({
      id: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      palette: input.palette ?? null,
      iconColor: input.iconColor ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get()

  if (!inserted) {
    throw new Error('createProject: insert returned no row')
  }

  return rowToDTO(inserted)
}

export function updateProject(id: string, patch: UpdateProjectInput): ProjectDTO {
  const updated = db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning()
    .get()

  if (!updated) {
    throw new Error(`updateProject: update returned no row for id ${id}`)
  }

  return rowToDTO(updated)
}

export function deleteProject(id: string): void {
  db.delete(projects).where(eq(projects.id, id)).run()
}

export function getMemorySummary(id: string): string | null {
  const row = db.select().from(projects).where(eq(projects.id, id)).get()
  return row?.memorySummary ?? null
}

export function getDefaultModelId(id: string): string | null {
  const row = db.select().from(projects).where(eq(projects.id, id)).get()
  return row?.defaultModelId ?? null
}

export function setMemorySummary(id: string, summary: string | null): void {
  db.update(projects).set({ memorySummary: summary }).where(eq(projects.id, id)).run()
}
