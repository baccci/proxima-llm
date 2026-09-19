import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useCompaction(chatId: string | null) {
  return useQuery({
    queryKey: queryKeys.compaction(chatId ?? ''),
    queryFn: () => rpcRequest().getCompactionInfo({ chatId: chatId! }),
    enabled: !!chatId,
  })
}
