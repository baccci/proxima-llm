import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useLogInfo() {
  return useQuery({
    queryKey: queryKeys.logInfo(),
    queryFn: () => rpcRequest().getLogInfo({}),
  })
}
