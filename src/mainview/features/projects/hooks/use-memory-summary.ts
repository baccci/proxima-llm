import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useMemorySummary(projectId: string) {
  return useQuery({
    queryKey: queryKeys.memorySummary(projectId),
    queryFn: () => rpcRequest().getMemorySummary({ projectId }),
  })
}
