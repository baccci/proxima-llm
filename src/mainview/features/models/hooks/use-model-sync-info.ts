import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useModelSyncInfo() {
  return useQuery({
    queryKey: queryKeys.modelSyncInfo(),
    queryFn: () => electroview.rpc?.request.getModelSyncInfo({}),
  })
}
