import { createHash, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { Utils } from 'electrobun/bun';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import type { ProjectFileDTO } from '../../shared-contracts/schemas/project-file.schema';
import { db } from '../db/client';
import { projectFiles } from '../db/schema';

const MAX_BYTE_SIZE = 20 * 1024 * 1024;

const ALLOWED_TYPES = new Set(['text/markdown', 'text/plain', 'application/json', 'text/csv']);

const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'cs',
  'php',
  'sh',
  'yaml',
  'yml',
  'toml',
  'sql',
]);

const TEXT_EXTENSIONS: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
};

function resolveMediaType(name: string, provided: string): string {
  if (ALLOWED_TYPES.has(provided)) return provided;
  const ext = extname(name).replace('.', '').toLowerCase();
  if (TEXT_EXTENSIONS[ext]) return TEXT_EXTENSIONS[ext];
  if (CODE_EXTENSIONS.has(ext)) return 'text/plain';
  throw new Error(`Unsupported media type: ${provided}`);
}

function resolveExtension(name: string): string {
  return extname(name).replace('.', '').toLowerCase() || 'txt';
}

function rowToDTO(row: typeof projectFiles.$inferSelect): ProjectFileDTO {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    relPath: row.relPath,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function saveProjectFile(input: {
  projectId: string;
  name: string;
  data: string;
  mediaType: string;
}): ProjectFileDTO {
  const mediaType = resolveMediaType(input.name, input.mediaType);
  const bytes = new Uint8Array(Buffer.from(input.data, 'base64'));

  if (bytes.byteLength > MAX_BYTE_SIZE) {
    throw new Error(
      `File too large: max 20 MB (got ${Math.round(bytes.byteLength / 1024 / 1024)} MB)`,
    );
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const ext = resolveExtension(input.name);
  const relPath = `projects/${input.projectId}/files/${sha256}.${ext}`;
  const absDir = join(Utils.paths.userData, 'projects', input.projectId, 'files');
  const absPath = join(Utils.paths.userData, relPath);

  const existing = db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.sha256, sha256), eq(projectFiles.projectId, input.projectId)))
    .get();

  if (existing) {
    return rowToDTO(existing);
  }

  if (!existsSync(absPath)) {
    mkdirSync(absDir, { recursive: true });
    writeFileSync(absPath, bytes);
  }

  const id = randomUUID();
  const now = new Date();
  db.insert(projectFiles)
    .values({
      id,
      projectId: input.projectId,
      name: input.name,
      mediaType,
      byteSize: bytes.byteLength,
      sha256,
      relPath,
      createdAt: now,
    })
    .run();

  return rowToDTO(db.select().from(projectFiles).where(eq(projectFiles.id, id)).get()!);
}

export function listProjectFiles(projectId: string): ProjectFileDTO[] {
  return db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId))
    .all()
    .map(rowToDTO);
}

export function readProjectFileText(projectId: string, fileId: string): string {
  const row = db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId)))
    .get();

  if (!row) throw new Error(`Project file not found: ${fileId}`);

  const absPath = join(Utils.paths.userData, row.relPath);
  if (!existsSync(absPath)) throw new Error(`Project file missing on disk: ${fileId}`);

  return readFileSync(absPath, 'utf-8');
}

export function readProjectFileTextByName(projectId: string, name: string): string {
  const row = db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.name, name)))
    .get();
  if (!row) throw new Error(`Project file not found: "${name}"`);
  const absPath = join(Utils.paths.userData, row.relPath);
  if (!existsSync(absPath)) throw new Error(`Project file missing on disk: "${name}"`);
  return readFileSync(absPath, 'utf-8');
}

export function deleteProjectFile(id: string): void {
  const row = db.select().from(projectFiles).where(eq(projectFiles.id, id)).get();
  if (!row) return;

  const absPath = join(Utils.paths.userData, row.relPath);
  if (existsSync(absPath)) {
    rmSync(absPath);
  }

  db.delete(projectFiles).where(eq(projectFiles.id, id)).run();
}
