import { randomUUID } from 'crypto';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import type { SendMessageInput } from '../../shared-contracts/rpc/app-rpc.types';
import {
  ChatComposerState,
  type ChatDTO,
  type CreateChatInput,
} from '../../shared-contracts/schemas/chat.schema';
import type { MessageDTO, MessagePart } from '../../shared-contracts/schemas/message.schema';
import { db } from '../db/client';
import { chats, messages } from '../db/schema';
import * as attachmentService from './attachment.service';

function chatRowToDTO(row: typeof chats.$inferSelect): ChatDTO {
  return {
    id: row.id,
    projectId: row.projectId ?? null,
    title: row.title,
    pinned: row.pinned,
    modelId: row.modelId ?? null,
    composer: ChatComposerState.parse(row.composer ?? {}),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    lastMessageAt: new Date(row.lastMessageAt).toISOString(),
  };
}

function messageRowToDTO(row: typeof messages.$inferSelect): MessageDTO {
  return {
    id: row.id,
    chatId: row.chatId,
    role: row.role as MessageDTO['role'],
    parts: row.parts as MessagePart[],
    modelId: row.modelId ?? null,
    usage: row.usage as MessageDTO['usage'],
    stopReason: row.stopReason ? (row.stopReason as 'user-cancel' | 'idle-timeout') : undefined,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

export function getChat(id: string): ChatDTO | undefined {
  const row = db.select().from(chats).where(eq(chats.id, id)).get();
  return row ? chatRowToDTO(row) : undefined;
}

export function listChats(projectId: string | null): ChatDTO[] {
  return db
    .select()
    .from(chats)
    .where(projectId !== null ? eq(chats.projectId, projectId) : undefined)
    .orderBy(desc(chats.lastMessageAt))
    .all()
    .map(chatRowToDTO);
}

export function createChat(input: CreateChatInput): ChatDTO {
  const now = new Date();
  const id = randomUUID();
  const composer = ChatComposerState.parse(input.composer ?? {});
  db.insert(chats)
    .values({
      id,
      projectId: input.projectId ?? null,
      title: input.title ?? 'New Chat',
      modelId: input.modelId ?? null,
      composer: composer as unknown,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    })
    .run();
  return chatRowToDTO(db.select().from(chats).where(eq(chats.id, id)).get()!);
}

export function updateChat(
  id: string,
  patch: {
    title?: string;
    pinned?: boolean;
    modelId?: string;
    composer?: Partial<ChatComposerState>;
  },
): ChatDTO {
  const now = new Date();
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle json column requires unknown cast
  const update: Record<string, any> = { updatedAt: now };

  if (patch.title !== undefined) update.title = patch.title;
  if (patch.pinned !== undefined) update.pinned = patch.pinned;
  if (patch.modelId !== undefined) update.modelId = patch.modelId;
  if (patch.composer !== undefined) {
    const current = db.select().from(chats).where(eq(chats.id, id)).get();
    const currentComposer = ChatComposerState.parse(current?.composer ?? {});
    update.composer = { ...currentComposer, ...patch.composer };
  }

  db.update(chats).set(update).where(eq(chats.id, id)).run();
  return chatRowToDTO(db.select().from(chats).where(eq(chats.id, id)).get()!);
}

export function deleteChat(id: string): void {
  db.delete(chats).where(eq(chats.id, id)).run();
}

export function listMessages(chatId: string): MessageDTO[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
    .all()
    .map(messageRowToDTO);
}

// Streaming is wired in rpc.ts where mainWindow is accessible.
// This returns the user message id; the stream is started from rpc.ts.
export function createUserMessage(input: SendMessageInput): MessageDTO {
  const now = new Date();
  const id = randomUUID();
  const parts: MessagePart[] = [];

  for (const attachmentId of input.attachmentIds ?? []) {
    const att = attachmentService.getAttachment(attachmentId);
    if (!att) continue;
    if (att.kind === 'image') {
      parts.push({ type: 'image', attachmentId });
    } else {
      parts.push({ type: 'file', attachmentId, mediaType: att.mediaType });
    }
  }

  parts.push({ type: 'text', text: input.content });
  db.insert(messages)
    .values({
      id,
      chatId: input.chatId,
      role: 'user',
      modelId: input.modelId,
      parts: parts as unknown as string,
      createdAt: now,
    })
    .run();
  db.update(chats)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(chats.id, input.chatId))
    .run();
  return messageRowToDTO(db.select().from(messages).where(eq(messages.id, id)).get()!);
}

export function truncateMessagesAfter(chatId: string, messageId: string): void {
  const all = listMessages(chatId);
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  const toDelete = all.slice(idx + 1).map((m) => m.id);
  if (toDelete.length === 0) return;
  db.delete(messages).where(inArray(messages.id, toDelete)).run();
}

export function updateUserMessageText(messageId: string, content: string): void {
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!row) return;
  const parts = (row.parts as MessagePart[]).map((p) =>
    p.type === 'text' ? { ...p, text: content } : p,
  );
  // Append a text part if the message had none
  if (!parts.some((p) => p.type === 'text')) {
    parts.push({ type: 'text', text: content });
  }
  db.update(messages)
    .set({ parts: parts as unknown as string })
    .where(eq(messages.id, messageId))
    .run();
}

export function saveAssistantMessage(
  chatId: string,
  modelId: string,
  parts: MessagePart[],
  usage: MessageDTO['usage'],
  stopReason?: 'user-cancel' | 'idle-timeout',
): MessageDTO {
  const now = new Date();
  const id = randomUUID();
  db.insert(messages)
    .values({
      id,
      chatId,
      role: 'assistant',
      modelId,
      parts: parts as unknown as string,
      usage: usage as unknown as string,
      stopReason: stopReason ?? null,
      createdAt: now,
    })
    .run();
  db.update(chats)
    .set({ lastMessageAt: now, updatedAt: now, modelId })
    .where(eq(chats.id, chatId))
    .run();
  return messageRowToDTO(db.select().from(messages).where(eq(messages.id, id)).get()!);
}
