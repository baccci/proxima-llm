import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useLogInfo() {
  return useQuery({
    queryKey: queryKeys.logInfo(),
    queryFn: () => electroview.rpc?.request.getLogInfo({}),
  })
}
