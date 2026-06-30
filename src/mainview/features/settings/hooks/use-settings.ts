import { PROVIDER_IDS, type ProviderId } from '@shared/providers/registry'
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

export function useApiKeyStatuses(): Record<ProviderId, boolean> {
  const { data: anthropic } = useApiKeyStatus(PROVIDER_IDS[0])
  const { data: openrouter } = useApiKeyStatus(PROVIDER_IDS[1])
  return {
    anthropic: anthropic?.configured ?? false,
    openrouter: openrouter?.configured ?? false,
  }
}
