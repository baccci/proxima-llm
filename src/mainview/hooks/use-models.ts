import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models(),
    queryFn: () => rpcRequest().listModels({}),
  })
}
