import type { AddProjectFileInput } from '@shared/schemas/project-file.schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview, rpcRequest } from '@/lib/rpc.client'

export function useProjectFiles(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectFiles(projectId),
    queryFn: () => electroview.rpc?.request.listProjectFiles({ projectId }),
  })
}

export function useAddProjectFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddProjectFileInput) => rpcRequest().addProjectFile(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(data.projectId) })
    },
  })
}

export function useDeleteProjectFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; projectId: string }) =>
      rpcRequest().deleteProjectFile({ id }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectFiles(variables.projectId) })
    },
  })
}
