import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { electroview } from '@/lib/rpc.client'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => electroview.rpc?.request.getSettings({}),
  })
}

export function useApiKeyStatus(provider: string) {
  return useQuery({
    queryKey: queryKeys.apiKey(provider),
    queryFn: () => electroview.rpc?.request.hasApiKey({ provider }),
  })
}
