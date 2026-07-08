import type { ChatComposerState, ChatDTO, CreateChatInput } from '@shared/schemas/chat.schema'
import type {
  MessageDTO,
  MessagePart,
  RetryMessageInput,
  SendMessageInput,
} from '@shared/schemas/message.schema'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest as req } from '@/lib/rpc.client'

type OptimisticAttachment = { id: string; kind: 'image' | 'file'; mediaType: string }

type UpdateChatInput = {
  id: string
  title?: string
  pinned?: boolean
  modelId?: string
  composer?: Partial<ChatComposerState>
}

export const chat = {
  list: (projectId: string | null = null) =>
    queryClient.fetchQuery({
      queryKey: queryKeys.chats(projectId),
      queryFn: () => req().listChats({ projectId }),
    }),

  create: async (input: CreateChatInput = {}) => {
    const created = await req().createChat(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.chats(created.projectId ?? null) })
    queryClient.invalidateQueries({ queryKey: queryKeys.chats(null) })
    return created
  },

  update: async (input: UpdateChatInput) => {
    // Optimistic update — merge patch into every cached chat list immediately
    const snapshots = queryClient.getQueriesData<ChatDTO[]>({ queryKey: ['chats'] })
    queryClient.setQueriesData<ChatDTO[]>({ queryKey: ['chats'] }, (old) =>
      old?.map((c) => {
        if (c.id !== input.id) return c
        return {
          ...c,
          ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
          ...(input.composer !== undefined
            ? { composer: { ...c.composer, ...input.composer } }
            : {}),
        }
      }),
    )
    try {
      const updated = await req().updateChat(input)
      queryClient.invalidateQueries({ queryKey: ['chats'] })
      return updated
    } catch (err) {
      // Rollback to pre-mutation snapshots
      for (const [key, data] of snapshots) {
        queryClient.setQueryData(key, data)
      }
      throw err
    }
  },

  remove: async (id: string) => {
    await req().deleteChat({ id })
    queryClient.invalidateQueries({ queryKey: ['chats'] })
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
    if (content) parts.push({ type: 'text', text: content })
    for (const att of attachments) {
      if (att.kind === 'image') {
        parts.push({ type: 'image', attachmentId: att.id })
      } else {
        parts.push({ type: 'file', attachmentId: att.id, mediaType: att.mediaType })
      }
    }
    const optimistic: MessageDTO = {
      id: `optimistic-${Date.now()}`,
      chatId,
      role: 'user',
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

  invalidateList: () => queryClient.invalidateQueries({ queryKey: ['chats'] }),
}
