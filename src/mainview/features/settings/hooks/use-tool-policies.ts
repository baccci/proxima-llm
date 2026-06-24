import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview, rpcRequest } from '@/lib/rpc.client'

export function useToolPolicies() {
  return useQuery({
    queryKey: queryKeys.toolPolicies(),
    queryFn: () => electroview.rpc?.request.listToolPolicies({}),
  })
}

export function useSetToolPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { toolName: string; policy: 'allow' | 'ask' | 'deny' }) =>
      rpcRequest().setToolPolicy(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolPolicies() })
    },
  })
}
