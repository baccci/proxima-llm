import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import type {
  CreateProjectInput,
  ProjectDTO,
  UpdateProjectInput,
} from '../../shared-contracts/schemas/project.schema';
import { db } from '../db/client';
import { projects } from '../db/schema';

function rowToDTO(row: typeof projects.$inferSelect): ProjectDTO {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    systemPrompt: row.systemPrompt ?? null,
    memory: row.memory ?? null,
    defaultModelId: row.defaultModelId ?? null,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export function getProject(id: string): ProjectDTO | undefined {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  return row ? rowToDTO(row) : undefined;
}

export function listProjects(): ProjectDTO[] {
  return db.select().from(projects).all().map(rowToDTO);
}

export function createProject(input: CreateProjectInput): ProjectDTO {
  const now = new Date();
  const id = randomUUID();
  db.insert(projects)
    .values({
      id,
      name: input.name,
      description: input.description ?? null,
      systemPrompt: input.systemPrompt ?? null,
      memory: input.memory ?? null,
      defaultModelId: input.defaultModelId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return rowToDTO(db.select().from(projects).where(eq(projects.id, id)).get()!);
}

export function updateProject(id: string, patch: UpdateProjectInput): ProjectDTO {
  const now = new Date();
  db.update(projects)
    .set({ ...patch, updatedAt: now })
    .where(eq(projects.id, id))
    .run();
  return rowToDTO(db.select().from(projects).where(eq(projects.id, id)).get()!);
}

export function deleteProject(id: string): void {
  db.delete(projects).where(eq(projects.id, id)).run();
}
