import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useControlTokens(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.controlTokens(),
    queryFn: () => rpcRequest().listControlTokens({}),
    enabled,
  })
}
