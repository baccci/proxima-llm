import { randomUUID } from 'crypto';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import {
  ChatComposerState,
  ChatDTO,
  type CreateChatInput,
} from '../../../shared-contracts/schemas/chat.schema';
import type { SendMessageInput } from '../../../shared-contracts/schemas/message.schema';
import {
  MessageDTO,
  type MessagePart,
  type StopReason,
} from '../../../shared-contracts/schemas/message.schema';
import { db } from '../../infra/db/client';
import { chats, messages } from '../../infra/db/schema';
import * as attachmentService from '../attachment/attachment.repository';

function chatRowToDTO(row: typeof chats.$inferSelect): ChatDTO {
  return ChatDTO.parse({
    ...row,
    // Composer JSON can be absent or partial on older rows, parse fills the defaults.
    composer: ChatComposerState.parse(row.composer ?? {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
  });
}

function messageRowToDTO(row: typeof messages.$inferSelect): MessageDTO {
  return MessageDTO.parse({
    ...row,
    // Column is nullable but the DTO field is optional, so an absent reason becomes undefined.
    stopReason: row.stopReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
  });
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
  const composer = ChatComposerState.parse(input.composer ?? {});

  const inserted = db
    .insert(chats)
    .values({
      id: randomUUID(),
      projectId: input.projectId ?? null,
      title: input.title ?? 'New Chat',
      modelId: input.modelId ?? null,
      composer: composer as unknown,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    })
    .returning()
    .get();

  if (!inserted) {
    throw new Error('createChat: insert returned no row');
  }

  return chatRowToDTO(inserted);
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

  if (patch.title !== undefined) {
    update.title = patch.title;
  }
  if (patch.pinned !== undefined) {
    update.pinned = patch.pinned;
  }
  if (patch.modelId !== undefined) {
    update.modelId = patch.modelId;
  }

  if (patch.composer !== undefined) {
    // Composer patches merge into the stored state, they do not replace it.
    const current = db.select().from(chats).where(eq(chats.id, id)).get();
    const currentComposer = ChatComposerState.parse(current?.composer ?? {});
    update.composer = { ...currentComposer, ...patch.composer };
  }

  const updated = db.update(chats).set(update).where(eq(chats.id, id)).returning().get();

  if (!updated) {
    throw new Error(`updateChat: update returned no row for id ${id}`);
  }

  return chatRowToDTO(updated);
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

// Only persists the user turn. Streaming is wired in rpc.ts where mainWindow is
// accessible, so the assistant stream is started from there.
export function createUserMessage(input: SendMessageInput): MessageDTO {
  const now = new Date();
  const parts: MessagePart[] = [];

  // Turn each attachment into an image or file part, then append the typed text.
  for (const attachmentId of input.attachmentIds ?? []) {
    const att = attachmentService.getAttachment(attachmentId);

    if (!att) {
      continue;
    }

    if (att.kind === 'image') {
      parts.push({ type: 'image', attachmentId });
    } else {
      parts.push({ type: 'file', attachmentId, mediaType: att.mediaType });
    }
  }

  parts.push({ type: 'text', text: input.content });

  const inserted = db
    .insert(messages)
    .values({
      id: randomUUID(),
      chatId: input.chatId,
      role: 'user',
      modelId: input.modelId,
      parts: parts as unknown as string,
      createdAt: now,
    })
    .returning()
    .get();

  if (!inserted) {
    throw new Error('createUserMessage: insert returned no row');
  }

  // Bump the chat so it sorts to the top of the recency-ordered list.
  db.update(chats)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(chats.id, input.chatId))
    .run();

  return messageRowToDTO(inserted);
}

// Drop every message after the given one. Used when a turn is retried or edited,
// so the replaced tail does not linger.
export function truncateMessagesAfter(chatId: string, messageId: string): void {
  const all = listMessages(chatId);
  const idx = all.findIndex((m) => m.id === messageId);

  if (idx === -1) {
    return;
  }

  const toDelete = all.slice(idx + 1).map((m) => m.id);

  if (toDelete.length === 0) {
    return;
  }

  db.delete(messages).where(inArray(messages.id, toDelete)).run();
}

export function updateUserMessageText(messageId: string, content: string): void {
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get();

  if (!row) {
    return;
  }

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
  stopReason?: StopReason,
): MessageDTO {
  const now = new Date();

  const inserted = db
    .insert(messages)
    .values({
      id: randomUUID(),
      chatId,
      role: 'assistant',
      modelId,
      parts: parts as unknown as string,
      usage: usage as unknown as string,
      stopReason: stopReason ?? null,
      createdAt: now,
    })
    .returning()
    .get();

  if (!inserted) {
    throw new Error('saveAssistantMessage: insert returned no row');
  }

  // Bump the chat to the top and record the model that produced this reply.
  db.update(chats)
    .set({ lastMessageAt: now, updatedAt: now, modelId })
    .where(eq(chats.id, chatId))
    .run();

  return messageRowToDTO(inserted);
}
