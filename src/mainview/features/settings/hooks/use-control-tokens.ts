import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useControlTokens(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.controlTokens(),
    queryFn: () => electroview.rpc?.request.listControlTokens({}),
    enabled,
  })
}
