import type { ToolPolicy } from '@shared/tools/tool-policy'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useToolPolicies() {
  return useQuery({
    queryKey: queryKeys.toolPolicies(),
    queryFn: () => rpcRequest().listToolPolicies({}),
  })
}

export function useSetToolPolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { toolName: string; policy: ToolPolicy }) =>
      rpcRequest().setToolPolicy(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.toolPolicies() })
    },
  })
}
