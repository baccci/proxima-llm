import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useModelSyncInfo() {
  return useQuery({
    queryKey: queryKeys.modelSyncInfo(),
    queryFn: () => rpcRequest().getModelSyncInfo({}),
  })
}
