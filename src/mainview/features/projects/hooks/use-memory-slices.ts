import type { UpsertMemorySliceInput } from '@shared/schemas/memory-slice.schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview, rpcRequest } from '@/lib/rpc.client'

export function useMemorySlices(scope: 'global' | 'project', projectId: string | null) {
  return useQuery({
    queryKey: queryKeys.memorySlices(scope, projectId),
    queryFn: () => electroview.rpc?.request.listMemorySlices({ scope, projectId }),
  })
}

export function useUpsertMemorySlice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertMemorySliceInput) => rpcRequest().upsertMemorySlice(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memorySlices(data.scope, data.projectId),
      })
    },
  })
}

export function useDeleteMemorySlice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; scope: 'global' | 'project'; projectId: string | null }) =>
      rpcRequest().deleteMemorySlice({ id }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.memorySlices(variables.scope, variables.projectId),
      })
    },
  })
}
