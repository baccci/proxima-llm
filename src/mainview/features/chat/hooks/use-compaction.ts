import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useCompaction(chatId: string | null) {
  return useQuery({
    queryKey: queryKeys.compaction(chatId ?? ''),
    queryFn: () => electroview.rpc?.request.getCompactionInfo({ chatId: chatId! }),
    enabled: !!chatId,
  })
}
