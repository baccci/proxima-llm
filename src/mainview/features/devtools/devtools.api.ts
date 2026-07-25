import { DevOverrideKey } from '@shared/dev/dev-override-keys'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest } from '@/lib/rpc.client'

export function useSetCompactionRatio() {
  return useMutation({
    mutationFn: (ratio: number) =>
      rpcRequest().devSetOverride({ key: DevOverrideKey.enum.compactionRatio, value: ratio }),
  })
}

export function useSetForcedTokens() {
  return useMutation({
    mutationFn: (tokens: number | null) =>
      rpcRequest().devSetOverride({ key: DevOverrideKey.enum.forcedContextTokens, value: tokens }),
  })
}

export function useForceCompact() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (chatId: string) => rpcRequest().devForceCompact({ chatId }),
    onSuccess: (_data, chatId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.compaction(chatId) })
    },
  })
}
