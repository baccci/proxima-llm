import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => rpcRequest().listProjects({}),
  })
}
