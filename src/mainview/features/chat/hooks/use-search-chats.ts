import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { SEARCH_MIN_QUERY_LENGTH, SEARCH_RESULT_LIMIT } from '@/features/chat/constants'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

// Chat search results for a query. The caller passes a deferred query string, so fast
// typing coalesces into fewer round trips without a timer of our own.
//
// A one or two character query matches most of the database and tells the user nothing,
// so the query stays disabled until there is enough to go on. Previous results stay on
// screen while the next ones load, which keeps the list from flashing empty on every
// keystroke.
export function useSearchChats(query: string, projectId: string | null) {
  const trimmed = query.trim()

  return useQuery({
    queryKey: queryKeys.chatSearch(projectId, trimmed),
    queryFn: () =>
      rpcRequest().searchChats({ query: trimmed, projectId, limit: SEARCH_RESULT_LIMIT }),
    enabled: trimmed.length >= SEARCH_MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
  })
}
