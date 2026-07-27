import { createHash, randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { Utils } from 'electrobun/bun'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { ProjectFileDTO } from '../../../shared-contracts/schemas/project-file.schema'
import { db } from '../../infra/db/client'
import { projectFiles } from '../../infra/db/schema'

const MAX_MB = 20
const MAX_BYTE_SIZE = MAX_MB * 1024 * 1024

const ALLOWED_TYPES = new Set(['text/markdown', 'text/plain', 'application/json', 'text/csv'])

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
])

const TEXT_EXTENSIONS: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
}

function resolveMediaType(name: string, provided: string): string {
  if (ALLOWED_TYPES.has(provided)) {
    return provided
  }

  const ext = extname(name).replace('.', '').toLowerCase()
  const text = TEXT_EXTENSIONS[ext]

  if (text) {
    return text
  }

  if (CODE_EXTENSIONS.has(ext)) {
    return 'text/plain'
  }

  throw new Error(`Unsupported media type: ${provided}`)
}

function resolveExtension(name: string): string {
  return extname(name).replace('.', '').toLowerCase() || 'txt'
}

function rowToDTO(row: typeof projectFiles.$inferSelect): ProjectFileDTO {
  return ProjectFileDTO.parse({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    relPath: row.relPath,
    createdAt: new Date(row.createdAt).toISOString(),
  })
}

function readTextForRow(row: typeof projectFiles.$inferSelect | undefined, label: string): string {
  if (!row) {
    throw new Error(`Project file not found: ${label}`)
  }

  const absPath = join(Utils.paths.userData, row.relPath)

  if (!existsSync(absPath)) {
    throw new Error(`Project file missing on disk: ${label}`)
  }

  return readFileSync(absPath, 'utf-8')
}

export function saveProjectFile(input: {
  projectId: string
  name: string
  data: string
  mediaType: string
}): ProjectFileDTO {
  const mediaType = resolveMediaType(input.name, input.mediaType)
  const bytes = new Uint8Array(Buffer.from(input.data, 'base64'))

  if (bytes.byteLength > MAX_BYTE_SIZE) {
    throw new Error(
      `File too large: max ${MAX_MB} MB (got ${Math.round(bytes.byteLength / 1024 / 1024)} MB)`,
    )
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const ext = resolveExtension(input.name)
  const relPath = `projects/${input.projectId}/files/${sha256}.${ext}`
  const absDir = join(Utils.paths.userData, 'projects', input.projectId, 'files')
  const absPath = join(Utils.paths.userData, relPath)

  const existing = db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.sha256, sha256), eq(projectFiles.projectId, input.projectId)))
    .get()

  if (existing) {
    return rowToDTO(existing)
  }

  if (!existsSync(absPath)) {
    mkdirSync(absDir, { recursive: true })
    writeFileSync(absPath, bytes)
  }

  const inserted = db
    .insert(projectFiles)
    .values({
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      mediaType,
      byteSize: bytes.byteLength,
      sha256,
      relPath,
      createdAt: new Date(),
    })
    .returning()
    .get()

  if (!inserted) {
    throw new Error('saveProjectFile: insert returned no row')
  }

  return rowToDTO(inserted)
}

export function listProjectFiles(projectId: string): ProjectFileDTO[] {
  return db
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.projectId, projectId))
    .all()
    .map(rowToDTO)
}

export function readProjectFileText(projectId: string, fileId: string): string {
  const row = db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId)))
    .get()

  return readTextForRow(row, fileId)
}

export function readProjectFileTextByName(projectId: string, name: string): string {
  const row = db
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.name, name)))
    .get()

  return readTextForRow(row, `"${name}"`)
}

export function deleteProjectFile(id: string): void {
  const row = db.select().from(projectFiles).where(eq(projectFiles.id, id)).get()

  if (!row) {
    return
  }

  const absPath = join(Utils.paths.userData, row.relPath)

  if (existsSync(absPath)) {
    rmSync(absPath)
  }

  db.delete(projectFiles).where(eq(projectFiles.id, id)).run()
}
