import type { CreateProjectInput, UpdateProjectInput } from '@shared/schemas/project.schema'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest as req } from '@/lib/rpc.client'

export const projects = {
  list: () =>
    queryClient.fetchQuery({
      queryKey: queryKeys.projects(),
      queryFn: () => req().listProjects({}),
    }),

  create: async (input: CreateProjectInput) => {
    const created = await req().createProject(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    return created
  },

  update: async (input: UpdateProjectInput & { id: string }) => {
    const updated = await req().updateProject(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
    return updated
  },

  remove: async (id: string) => {
    await req().deleteProject({ id })
    queryClient.invalidateQueries({ queryKey: queryKeys.projects() })
  },
}
