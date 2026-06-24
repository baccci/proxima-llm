import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useChats(projectId: string | null = null) {
  return useQuery({
    queryKey: queryKeys.chats(projectId),
    queryFn: () => electroview.rpc?.request.listChats({ projectId }),
  })
}
