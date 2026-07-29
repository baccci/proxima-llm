import type { ChatCursor } from '@shared/schemas/chat.schema'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { CHATS_PAGE_SIZE } from '@/features/chat/constants'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

// The paginated (unpinned) chat list. Pages walk newest-first by keyset cursor; a null
// nextCursor ends the list. Callers flatten with flattenChatPages.
export function useChats(projectId: string | null = null) {
  return useInfiniteQuery({
    queryKey: queryKeys.chats(projectId),
    queryFn: ({ pageParam }) =>
      rpcRequest().listChats({ projectId, cursor: pageParam, limit: CHATS_PAGE_SIZE }),
    initialPageParam: null as ChatCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

// The pinned chats for a scope, as one small unpaginated list.
export function usePinnedChats(projectId: string | null = null) {
  return useQuery({
    queryKey: queryKeys.chatsPinned(projectId),
    queryFn: () => rpcRequest().listPinnedChats({ projectId }),
  })
}

// A single chat by id. Disabled (and never fetched) while no chat is selected.
export function useChat(id: string | null) {
  return useQuery({
    queryKey: queryKeys.chat(id),
    queryFn: () => {
      if (id === null) {
        return null
      }
      return rpcRequest().getChat({ id })
    },
    enabled: id !== null,
  })
}
