import { createHash, randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { Utils } from 'electrobun/bun';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { AttachmentDTO, AttachmentKind } from '../../../shared-contracts/schemas/attachment.schema';
import { db } from '../../infra/db/client';
import { attachments } from '../../infra/db/schema';

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

// Validate the row at the DB boundary so a malformed kind or missing field fails here,
// not in the renderer. Mirrors model.service's rowToDTO.
function rowToDTO(row: typeof attachments.$inferSelect): AttachmentDTO {
  return AttachmentDTO.parse({
    id: row.id,
    chatId: row.chatId,
    kind: row.kind,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    relPath: row.relPath,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}

// Storage-path extension: prefer the uploaded name's extension, else map from media type.
function resolveExtension(name: string, mediaType: string): string {
  const fromName = extname(name).replace('.', '').toLowerCase();
  if (fromName) {
    return fromName;
  }

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
  const kind = input.mediaType.startsWith('image/')
    ? AttachmentKind.enum.image
    : AttachmentKind.enum.file;
  const ext = resolveExtension(input.name, input.mediaType);
  const relPath = `attachments/${input.chatId}/${sha256}.${ext}`;
  const absDir = join(Utils.paths.userData, 'attachments', input.chatId);
  const absPath = join(Utils.paths.userData, relPath);

  // Content-addressed by (chatId, sha256): a re-upload of identical bytes reuses the row.
  const existing = db
    .select()
    .from(attachments)
    .where(and(eq(attachments.sha256, sha256), eq(attachments.chatId, input.chatId)))
    .get();

  if (existing) {
    return rowToDTO(existing);
  }

  if (!existsSync(absPath)) {
    mkdirSync(absDir, { recursive: true });
    writeFileSync(absPath, bytes);
  }

  const inserted = db
    .insert(attachments)
    .values({
      id: randomUUID(),
      chatId: input.chatId,
      kind,
      mediaType: input.mediaType,
      byteSize: bytes.byteLength,
      sha256,
      relPath,
      createdAt: new Date(),
    })
    .returning()
    .get();

  if (!inserted) {
    throw new Error('saveAttachment: insert returned no row');
  }

  return rowToDTO(inserted);
}

export function getAttachment(id: string): AttachmentDTO | undefined {
  const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
  return row ? rowToDTO(row) : undefined;
}

export function getAttachmentBytes(
  id: string,
): { bytes: Buffer; mediaType: string; kind: AttachmentKind } | undefined {
  const row = db.select().from(attachments).where(eq(attachments.id, id)).get();
  if (!row) {
    return undefined;
  }

  const absPath = join(Utils.paths.userData, row.relPath);
  if (!existsSync(absPath)) {
    return undefined;
  }

  const bytes = readFileSync(absPath);
  return { bytes, mediaType: row.mediaType, kind: row.kind };
}

export function listAttachments(chatId: string): AttachmentDTO[] {
  return db.select().from(attachments).where(eq(attachments.chatId, chatId)).all().map(rowToDTO);
}

export type AttachmentView = {
  id: string;
  kind: AttachmentKind;
  mediaType: string;
  name: string;
  byteSize: number;
  dataUrl: string;
};

// Build the renderer-facing view of an attachment: its metadata plus a data: URL
// of the file bytes. Throws if the row or its file is missing so the caller can
// surface a clear error.
export function getAttachmentView(id: string): AttachmentView {
  const att = getAttachment(id);
  if (!att) {
    throw new Error(`Attachment not found: ${id}`);
  }

  const bytes = getAttachmentBytes(id);
  if (!bytes) {
    throw new Error(`Attachment file missing: ${id}`);
  }

  const dataUrl = `data:${bytes.mediaType};base64,${bytes.bytes.toString('base64')}`;
  const name = att.relPath.split('/').pop() ?? att.id;

  return {
    id: att.id,
    kind: att.kind,
    mediaType: att.mediaType,
    name,
    byteSize: att.byteSize,
    dataUrl,
  };
}
