import { randomUUID } from 'crypto'
import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm'
import { AttachmentKind } from '../../../shared-contracts/schemas/attachment.schema'
import {
  ChatComposerState,
  type ChatCursor,
  ChatDTO,
  type ChatPage,
  type CreateChatInput,
  DEFAULT_CHAT_TITLE,
} from '../../../shared-contracts/schemas/chat.schema'
import {
  type ChatSearchHit,
  SearchHitKind,
  SNIPPET_MARK_CLOSE,
  SNIPPET_MARK_OPEN,
} from '../../../shared-contracts/schemas/chat-search.schema'
import type { SendMessageInput } from '../../../shared-contracts/schemas/message.schema'
import {
  MessageDTO,
  type MessagePart,
  MessageRole,
  PartKind,
  type StopReason,
} from '../../../shared-contracts/schemas/message.schema'
import { db, sqlite } from '../../infra/db/client'
import { chats, messages } from '../../infra/db/schema'
import * as attachmentService from '../attachment/attachment.repository'
import { toFtsQuery } from './fts-query'

// Composer JSON can be absent or partial (older rows, optional input); parse fills defaults.
function parseComposer(raw: unknown): ChatComposerState {
  return ChatComposerState.parse(raw ?? {})
}

function chatRowToDTO(row: typeof chats.$inferSelect): ChatDTO {
  return ChatDTO.parse({
    ...row,
    composer: parseComposer(row.composer),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
  })
}

function messageRowToDTO(row: typeof messages.$inferSelect): MessageDTO {
  return MessageDTO.parse({
    ...row,
    // Column is nullable but the DTO field is optional, so an absent reason becomes undefined.
    stopReason: row.stopReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
  })
}

// Bump a chat's recency so it sorts to the top of the recency-ordered list. Extra
// fields (e.g. the model that produced a reply) merge into the same write.
function bumpChatRecency(chatId: string, now: Date, extra?: { modelId?: string }): void {
  db.update(chats)
    .set({ lastMessageAt: now, updatedAt: now, ...extra })
    .where(eq(chats.id, chatId))
    .run()
}

export function getChat(id: string): ChatDTO | undefined {
  const row = db.select().from(chats).where(eq(chats.id, id)).get()
  return row ? chatRowToDTO(row) : undefined
}

type ListChatsParams = {
  projectId: string | null
  cursor: ChatCursor | null
  limit: number
}

// One keyset page of unpinned chats, newest first. Pinned chats are served
// separately by listPinnedChats, so a page is never short a filtered-out row.
export function listChats({ projectId, cursor, limit }: ListChatsParams): ChatPage {
  // Rows strictly after the cursor in (lastMessageAt DESC, id DESC): either an
  // older timestamp, or the same timestamp with a smaller id (the tiebreaker).
  const afterCursor = cursor
    ? or(
        lt(chats.lastMessageAt, new Date(cursor.lastMessageAt)),
        and(eq(chats.lastMessageAt, new Date(cursor.lastMessageAt)), lt(chats.id, cursor.id)),
      )
    : undefined

  const rows = db
    .select()
    .from(chats)
    .where(
      and(
        eq(chats.pinned, false),
        // A null projectId means "all chats" (no filter), a real id scopes to that project.
        projectId !== null ? eq(chats.projectId, projectId) : undefined,
        afterCursor,
      ),
    )
    .orderBy(desc(chats.lastMessageAt), desc(chats.id))
    // One extra row tells us whether a further page exists without a second query.
    .limit(limit + 1)
    .all()

  const hasMore = rows.length > limit
  const kept = hasMore ? rows.slice(0, limit) : rows
  const last = kept.at(-1)

  // Build the cursor from the last kept RAW row so lastMessageAt stays a number
  // (Date.getTime()), matching the keyset predicate above rather than the DTO string.
  const nextCursor: ChatCursor | null =
    hasMore && last ? { lastMessageAt: last.lastMessageAt.getTime(), id: last.id } : null

  return { items: kept.map(chatRowToDTO), nextCursor }
}

// All pinned chats for a project (or every project when null), newest first.
// Unpaginated: the pinned set is small and always shown in full.
export function listPinnedChats({ projectId }: { projectId: string | null }): ChatDTO[] {
  return db
    .select()
    .from(chats)
    .where(
      and(eq(chats.pinned, true), projectId !== null ? eq(chats.projectId, projectId) : undefined),
    )
    .orderBy(desc(chats.lastMessageAt), desc(chats.id))
    .all()
    .map(chatRowToDTO)
}

// Every chat (pinned included), newest first, in one shot. Only the control
// server's remote client uses this; the app UI uses the paginated listChats.
export function listAllChats(projectId: string | null): ChatDTO[] {
  return db
    .select()
    .from(chats)
    .where(projectId !== null ? eq(chats.projectId, projectId) : undefined)
    .orderBy(desc(chats.lastMessageAt))
    .all()
    .map(chatRowToDTO)
}

// How many tokens of surrounding text each snippet carries. FTS5 caps this at 64; a
// short window keeps a result row to one line while still showing why it matched.
const SNIPPET_TOKENS = 12

// Stands in for the text trimmed off either end of a snippet.
const SNIPPET_ELLIPSIS = '\u2026'

type SearchChatsParams = {
  query: string
  projectId: string | null
  limit: number
}

type TitleHitRow = {
  chatId: string
  projectId: string | null
  title: string
  snippet: string
  lastMessageAt: number
}

type ContentHitRow = TitleHitRow & { messageId: string }

// Search chat titles and message text. Title hits rank above content hits, because a
// chat named after the thing you typed is a stronger signal than a passing mention
// inside one. Within each group FTS5 orders by relevance: its `rank` column is bm25,
// which is negative and more negative the better the match, so plain ascending order
// puts the best first.
//
// One row per chat, carrying its best-matching message, so a chat that mentions the term
// fifty times cannot crowd out every other chat in the list.
export function searchChats({ query, projectId, limit }: SearchChatsParams): ChatSearchHit[] {
  const match = toFtsQuery(query)
  if (match === null) {
    return []
  }

  // The project filter is app-controlled, never user text, so composing it into the SQL
  // is safe. Both queries take the same trailing parameters in the same order.
  const projectFilter = projectId === null ? '' : 'AND c.project_id = ?'
  const scopeParams = projectId === null ? [] : [projectId]

  const titleRows = sqlite
    .query(
      `SELECT t.chat_id AS chatId, c.project_id AS projectId, c.title AS title,
              c.last_message_at AS lastMessageAt,
              snippet(chats_fts, 0, ?, ?, ?, ?) AS snippet
       FROM chats_fts t
       JOIN chats c ON c.id = t.chat_id
       WHERE chats_fts MATCH ? ${projectFilter}
       ORDER BY t.rank
       LIMIT ?`,
    )
    .all(
      SNIPPET_MARK_OPEN,
      SNIPPET_MARK_CLOSE,
      SNIPPET_ELLIPSIS,
      SNIPPET_TOKENS,
      match,
      ...scopeParams,
      limit,
    ) as TitleHitRow[]

  // Best-scoring message per chat. min(rank) with bare columns alongside it is the
  // SQLite idiom for "the row that holds the minimum", and it is the only shape that
  // works here: bm25() and snippet() are both rejected inside an aggregate or a window,
  // so the snippets are fetched separately below.
  const contentRows = sqlite
    .query(
      `SELECT f.chat_id AS chatId, f.message_id AS messageId, c.project_id AS projectId,
              c.title AS title, c.last_message_at AS lastMessageAt, min(f.rank) AS rank
       FROM messages_fts f
       JOIN chats c ON c.id = f.chat_id
       WHERE messages_fts MATCH ? ${projectFilter}
       GROUP BY f.chat_id
       ORDER BY rank
       LIMIT ?`,
    )
    .all(match, ...scopeParams, limit) as (ContentHitRow & { rank: number })[]

  const snippets = snippetsForMessages(
    match,
    contentRows.map((row) => row.messageId),
  )

  const hits: ChatSearchHit[] = titleRows.map((row) => ({
    chatId: row.chatId,
    projectId: row.projectId,
    title: row.title,
    kind: SearchHitKind.enum.title,
    messageId: null,
    snippet: row.snippet,
    lastMessageAt: new Date(row.lastMessageAt).toISOString(),
  }))

  const titled = new Set(hits.map((hit) => hit.chatId))

  for (const row of contentRows) {
    // A chat already listed for its title does not earn a second row for its content.
    if (titled.has(row.chatId)) {
      continue
    }

    hits.push({
      chatId: row.chatId,
      projectId: row.projectId,
      title: row.title,
      kind: SearchHitKind.enum.content,
      messageId: row.messageId,
      snippet: snippets.get(row.messageId) ?? '',
      lastMessageAt: new Date(row.lastMessageAt).toISOString(),
    })
  }

  return hits.slice(0, limit)
}

// Snippets for an already-chosen set of messages. Separate from the ranking query above
// because FTS5 refuses snippet() in an aggregate context, and the ranking has to group
// by chat to keep one row per chat.
function snippetsForMessages(match: string, messageIds: string[]): Map<string, string> {
  if (messageIds.length === 0) {
    return new Map()
  }

  const placeholders = messageIds.map(() => '?').join(', ')
  const rows = sqlite
    .query(
      `SELECT message_id AS messageId, snippet(messages_fts, 0, ?, ?, ?, ?) AS snippet
       FROM messages_fts
       WHERE messages_fts MATCH ? AND message_id IN (${placeholders})`,
    )
    .all(
      SNIPPET_MARK_OPEN,
      SNIPPET_MARK_CLOSE,
      SNIPPET_ELLIPSIS,
      SNIPPET_TOKENS,
      match,
      ...messageIds,
    ) as { messageId: string; snippet: string }[]

  return new Map(rows.map((row) => [row.messageId, row.snippet]))
}

export function createChat(input: CreateChatInput): ChatDTO {
  const now = new Date()
  const composer = parseComposer(input.composer)

  const inserted = db
    .insert(chats)
    .values({
      id: randomUUID(),
      projectId: input.projectId ?? null,
      title: input.title ?? DEFAULT_CHAT_TITLE,
      modelId: input.modelId ?? null,
      composer,
      pinned: false,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    })
    .returning()
    .get()

  if (!inserted) {
    throw new Error('createChat: insert returned no row')
  }

  return chatRowToDTO(inserted)
}

export function updateChat(
  id: string,
  patch: {
    title?: string
    pinned?: boolean
    modelId?: string
    composer?: Partial<ChatComposerState>
  },
): ChatDTO {
  const now = new Date()
  const update: Partial<typeof chats.$inferInsert> = { updatedAt: now }

  // Copy only the fields the patch actually sets, undefined keys stay untouched.
  if (patch.title !== undefined) {
    update.title = patch.title
  }
  if (patch.pinned !== undefined) {
    update.pinned = patch.pinned
  }
  if (patch.modelId !== undefined) {
    update.modelId = patch.modelId
  }

  if (patch.composer !== undefined) {
    // Composer patches merge into the stored state, they do not replace it.
    const current = db.select().from(chats).where(eq(chats.id, id)).get()
    const currentComposer = parseComposer(current?.composer)
    update.composer = { ...currentComposer, ...patch.composer }
  }

  const updated = db.update(chats).set(update).where(eq(chats.id, id)).returning().get()

  if (!updated) {
    throw new Error(`updateChat: update returned no row for id ${id}`)
  }

  return chatRowToDTO(updated)
}

export function deleteChat(id: string): void {
  db.delete(chats).where(eq(chats.id, id)).run()
}

export function listMessages(chatId: string): MessageDTO[] {
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt))
    .all()
    .map(messageRowToDTO)
}

// Only persists the user turn. Streaming is wired in rpc.ts where mainWindow is
// accessible, so the assistant stream is started from there.
export function createUserMessage(input: SendMessageInput): MessageDTO {
  const now = new Date()
  const parts: MessagePart[] = []

  // Turn each attachment into an image or file part, then append the typed text.
  for (const attachmentId of input.attachmentIds ?? []) {
    const att = attachmentService.getAttachment(attachmentId)

    // Attachment row vanished (deleted mid-send); skip it rather than fail the message.
    if (!att) {
      continue
    }

    if (att.kind === AttachmentKind.enum.image) {
      parts.push({ type: PartKind.enum.image, attachmentId })
    } else {
      parts.push({ type: PartKind.enum.file, attachmentId, mediaType: att.mediaType })
    }
  }

  parts.push({ type: PartKind.enum.text, text: input.content })

  const inserted = db
    .insert(messages)
    .values({
      id: randomUUID(),
      chatId: input.chatId,
      role: MessageRole.enum.user,
      modelId: input.modelId,
      parts,
      createdAt: now,
    })
    .returning()
    .get()

  if (!inserted) {
    throw new Error('createUserMessage: insert returned no row')
  }

  bumpChatRecency(input.chatId, now)

  return messageRowToDTO(inserted)
}

// Drop every message after the given one. Used when a turn is retried or edited,
// so the replaced tail does not linger.
export function truncateMessagesAfter(chatId: string, messageId: string): void {
  const all = listMessages(chatId)
  const idx = all.findIndex((m) => m.id === messageId)

  // Anchor already gone (deleted/retried); nothing after it to drop.
  if (idx === -1) {
    return
  }

  const toDelete = all.slice(idx + 1).map((m) => m.id)

  if (toDelete.length === 0) {
    return
  }

  db.delete(messages).where(inArray(messages.id, toDelete)).run()
}

export function updateUserMessageText(messageId: string, content: string): void {
  const row = db.select().from(messages).where(eq(messages.id, messageId)).get()

  // Message already gone (deleted/retried); nothing to edit, tolerate silently.
  if (!row) {
    return
  }

  const parts = row.parts.map((p) => (p.type === PartKind.enum.text ? { ...p, text: content } : p))

  // Append a text part if the message had none
  if (!parts.some((p) => p.type === PartKind.enum.text)) {
    parts.push({ type: PartKind.enum.text, text: content })
  }

  db.update(messages).set({ parts }).where(eq(messages.id, messageId)).run()
}

export function saveAssistantMessage(
  chatId: string,
  modelId: string,
  parts: MessagePart[],
  usage: MessageDTO['usage'],
  stopReason?: StopReason,
): MessageDTO {
  const now = new Date()

  const inserted = db
    .insert(messages)
    .values({
      id: randomUUID(),
      chatId,
      role: MessageRole.enum.assistant,
      modelId,
      parts,
      usage,
      stopReason: stopReason ?? null,
      createdAt: now,
    })
    .returning()
    .get()

  if (!inserted) {
    throw new Error('saveAssistantMessage: insert returned no row')
  }

  // Bump the chat to the top and record the model that produced this reply.
  bumpChatRecency(chatId, now, { modelId })

  return messageRowToDTO(inserted)
}
