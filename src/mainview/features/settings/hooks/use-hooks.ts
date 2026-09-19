import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useHooks() {
  return useQuery({
    queryKey: queryKeys.hooks(),
    queryFn: () => rpcRequest().listHooks({}),
  })
}

export function useSetHook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { actionId: string; enabled: boolean }) => rpcRequest().setHook(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hooks() })
    },
  })
}
