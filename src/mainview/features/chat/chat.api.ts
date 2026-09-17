import { AttachmentKind } from '@shared/schemas/attachment.schema'
import type {
  ChatComposerState,
  ChatDTO,
  ChatPage,
  CreateChatInput,
} from '@shared/schemas/chat.schema'
import {
  type MessageDTO,
  type MessagePart,
  MessageRole,
  PartKind,
  type RetryMessageInput,
  type SendMessageInput,
} from '@shared/schemas/message.schema'
import type { InfiniteData } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { CHAT_SEARCH_SEGMENT, queryKeys } from '@/lib/query-keys'
import { rpcRequest as req } from '@/lib/rpc.client'

type OptimisticAttachment = { id: string; kind: AttachmentKind; mediaType: string }

type UpdateChatInput = {
  id: string
  title?: string
  pinned?: boolean
  modelId?: string
  composer?: Partial<ChatComposerState>
}

// The fields a non-moving edit can change on a cached chat (pinned is excluded: a pin
// toggle reorders across lists, so it re-fetches instead of patching in place).
type ChatFieldPatch = Pick<UpdateChatInput, 'id' | 'title' | 'modelId' | 'composer'>

function patchOneChat(c: ChatDTO, patch: ChatFieldPatch): ChatDTO {
  if (c.id !== patch.id) {
    return c
  }
  return {
    ...c,
    ...(patch.modelId !== undefined ? { modelId: patch.modelId } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.composer !== undefined ? { composer: { ...c.composer, ...patch.composer } } : {}),
  }
}

function isInfiniteChatData(v: unknown): v is InfiniteData<ChatPage> {
  return typeof v === 'object' && v !== null && 'pages' in v
}

function isChatDTO(v: unknown): v is ChatDTO {
  return typeof v === 'object' && v !== null && 'id' in v
}

// Search results sit under ['chats'] so a broad invalidation reaches them, but their rows
// are search hits, not chats. The patcher below must skip them rather than try to merge a
// chat edit into a shape that has no chat in it.
function isChatSearchKey(key: readonly unknown[]): boolean {
  return key[1] === CHAT_SEARCH_SEGMENT
}

// Optimistically merge a non-moving edit into every cached chat shape under ['chats']:
// the paginated pages, the pinned arrays, and the single-chat detail. Each cache holds
// a different shape, so the updater branches on which one it got. The following
// invalidation is what brings search results back in line.
function patchChatInPages(patch: ChatFieldPatch): void {
  queryClient.setQueriesData<unknown>(
    { queryKey: queryKeys.chatsAll(), predicate: (q) => !isChatSearchKey(q.queryKey) },
    (old: unknown) => {
      if (isInfiniteChatData(old)) {
        return {
          ...old,
          pages: old.pages.map((p) => ({
            ...p,
            items: p.items.map((c) => patchOneChat(c, patch)),
          })),
        }
      }
      if (Array.isArray(old)) {
        return old.map((c) => patchOneChat(c, patch))
      }
      if (isChatDTO(old)) {
        return patchOneChat(old, patch)
      }
      return old
    },
  )
}

export const chat = {
  create: async (input: CreateChatInput = {}) => {
    const created = await req().createChat(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.chats(created.projectId ?? null) })
    queryClient.invalidateQueries({ queryKey: queryKeys.chats(null) })
    return created
  },

  update: async (input: UpdateChatInput) => {
    // A pin toggle moves the chat between the unpinned pages and the pinned list and
    // reorders it, so faking that optimistically is fiddly and error-prone. The local
    // SQLite round-trip is imperceptible, so just await and re-fetch.
    if (input.pinned !== undefined) {
      const updated = await req().updateChat(input)
      queryClient.invalidateQueries({ queryKey: queryKeys.chatsAll() })
      return updated
    }

    // Rename / model / composer don't move the row, so patch in place for zero flicker,
    // then reconcile with a background re-fetch (rolling back if the write fails).
    const snapshots = queryClient.getQueriesData({ queryKey: queryKeys.chatsAll() })
    patchChatInPages(input)
    try {
      const updated = await req().updateChat(input)
      queryClient.invalidateQueries({ queryKey: queryKeys.chatsAll() })
      return updated
    } catch (err) {
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(key, data)
      }
      throw err
    }
  },

  remove: async (id: string) => {
    await req().deleteChat({ id })
    queryClient.invalidateQueries({ queryKey: queryKeys.chatsAll() })
  },

  sendMessage: (input: SendMessageInput) => req().sendMessage(input),

  retryFromMessage: (input: RetryMessageInput) => req().retryFromMessage(input),

  cancelStream: (streamId: string) => req().cancelStream({ streamId }),

  listMessages: (chatId: string) =>
    queryClient.fetchQuery({
      queryKey: queryKeys.messages(chatId),
      queryFn: () => req().listMessages({ chatId }),
    }),

  invalidateMessages: (chatId: string) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.messages(chatId) }),

  invalidateCompaction: (chatId: string) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.compaction(chatId) }),

  compactNow: async (chatId: string) => {
    const result = await req().compactNow({ chatId })
    queryClient.invalidateQueries({ queryKey: queryKeys.compaction(chatId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.messages(chatId) })
    return result
  },

  addOptimisticUserMessage: (
    chatId: string,
    content: string,
    attachments: OptimisticAttachment[] = [],
  ) => {
    const parts: MessagePart[] = []
    if (content) {
      parts.push({ type: PartKind.enum.text, text: content })
    }
    for (const att of attachments) {
      if (att.kind === AttachmentKind.enum.image) {
        parts.push({ type: PartKind.enum.image, attachmentId: att.id })
        continue
      }
      parts.push({ type: PartKind.enum.file, attachmentId: att.id, mediaType: att.mediaType })
    }
    const optimistic: MessageDTO = {
      id: `optimistic-${Date.now()}`,
      chatId,
      role: MessageRole.enum.user,
      parts,
      modelId: null,
      usage: null,
      createdAt: new Date().toISOString(),
    }
    queryClient.setQueryData<MessageDTO[]>(queryKeys.messages(chatId), (old) => [
      ...(old ?? []),
      optimistic,
    ])
  },

  invalidateList: () => queryClient.invalidateQueries({ queryKey: queryKeys.chatsAll() }),
}
