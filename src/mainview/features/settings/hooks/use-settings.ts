import { ProviderId } from '@shared/providers/registry'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings(),
    queryFn: () => rpcRequest().getSettings({}),
  })
}

export function useApiKeyStatus(provider: ProviderId) {
  return useQuery({
    queryKey: queryKeys.apiKey(provider),
    queryFn: () => rpcRequest().hasApiKey({ provider }),
  })
}

// One fixed useApiKeyStatus call per provider (rules of hooks forbid a loop). Keys and
// arguments come from ProviderId.enum, so a reorder can't mismatch them and adding a
// provider becomes a compile error on the Record below.
export function useApiKeyStatuses(): Record<ProviderId, boolean> {
  const { data: anthropic } = useApiKeyStatus(ProviderId.enum.anthropic)
  const { data: openrouter } = useApiKeyStatus(ProviderId.enum.openrouter)
  return {
    [ProviderId.enum.anthropic]: anthropic?.configured ?? false,
    [ProviderId.enum.openrouter]: openrouter?.configured ?? false,
  }
}
