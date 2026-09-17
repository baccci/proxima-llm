import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models(),
    queryFn: () => electroview.rpc?.request.listModels({}),
  })
}
