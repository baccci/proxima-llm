import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useMessages(chatId: string | null) {
  return useQuery({
    queryKey: queryKeys.messages(chatId ?? ''),
    queryFn: () => rpcRequest().listMessages({ chatId: chatId! }),
    enabled: !!chatId,
  })
}
