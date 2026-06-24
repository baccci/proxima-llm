import { createHash, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { Utils } from 'electrobun/bun';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import type { AttachmentDTO } from '../../shared-contracts/schemas/attachment.schema';
import { db } from '../db/client';
import { attachments } from '../db/schema';

const MAX_BYTE_SIZE = 20 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

function attachmentRowToDTO(row: typeof attachments.$inferSelect): AttachmentDTO {
  return {
    id: row.id,
    chatId: row.chatId,
    kind: row.kind as AttachmentDTO['kind'],
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    relPath: row.relPath,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

function resolveExtension(name: string, mediaType: string): string {
  const fromName = extname(name).replace('.', '').toLowerCase();
  if (fromName) return fromName;
  return MEDIA_TYPE_EXTENSIONS[mediaType] ?? 'bin';
}

export function saveAttachment(input: {
  chatId: string;
  name: string;
  data: string;
  mediaType: string;
}): AttachmentDTO {
  if (!ALLOWED_TYPES.has(input.mediaType)) {
    throw new Error(`Unsupported media type: ${input.mediaType}`);
  }

  const bytes = new Uint8Array(Buffer.from(input.data, 'base64'));

  if (bytes.byteLength > MAX_BYTE_SIZE) {
    throw new Error(
      `File too large: max 20 MB (got ${Math.round(bytes.byteLength / 1024 / 1024)} MB)`,
    );
  }

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const kind = input.mediaType.startsWith('image/') ? 'image' : 'file';
  const ext = resolveExtension(input.name, input.mediaType);
  const relPath = `attachments/${input.chatId}/${sha256}.${ext}`;
  const absDir = join(Utils.paths.userData, 'attachments', input.chatId);
  const absPath = join(Utils.paths.userData, relPath);

  const existing = db
    .select()
    .from(attachments)
    .where(and(eq(attachments.sha256, sha256), eq(attachments.chatId, input.chatId)))
    .get();

  if (existing) {
    return attachmentRowToDTO(existing);
  }

  if (!existsSync(absPath)) {
    mkdirSync(absDir, { recursive: true });
    writeFileSync(absPath, bytes);
  }

  const id = randomUUID();
  const now = new Date();
  db.insert(attachments)
    .values({
      id,
      chatId: input.chatId,
      kind,
      mediaType: input.mediaType,
      byteSize: bytes.byteLength,
      sha256,
      relPath,
      createdAt: now,
    })
    .run();

  return attachmentRowToDTO(db.select().from(attachments).where(eq(attachments.id, id)).get()!);
}

export function getAttachment(id: string): AttachmentDTO | undefined {
  const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
  return row ? attachmentRowToDTO(row) : undefined;
}

export function getAttachmentBytes(
  id: string,
): { bytes: Buffer; mediaType: string; kind: 'image' | 'file' } | undefined {
  const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
  if (!row) return undefined;
  const absPath = join(Utils.paths.userData, row.relPath);
  if (!existsSync(absPath)) return undefined;
  const bytes = readFileSync(absPath);
  return { bytes, mediaType: row.mediaType, kind: row.kind as 'image' | 'file' };
}

export function listAttachments(chatId: string): AttachmentDTO[] {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.chatId, chatId))
    .all()
    .map(attachmentRowToDTO);
}
