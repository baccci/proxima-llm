import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects(),
    queryFn: () => electroview.rpc?.request.listProjects({}),
  })
}
