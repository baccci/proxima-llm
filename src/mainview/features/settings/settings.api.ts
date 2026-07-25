import type { ProviderId } from '@shared/providers/registry'
import type { UpdateSettingsInput } from '@shared/schemas/settings.schema'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest as req } from '@/lib/rpc.client'

export const settings = {
  update: async (input: UpdateSettingsInput) => {
    const updated = await req().updateSettings(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
    return updated
  },

  setApiKey: async (provider: ProviderId, key: string) => {
    await req().setApiKey({ provider, key })
    queryClient.invalidateQueries({ queryKey: queryKeys.apiKey(provider) })
  },

  generatePairingCode: () => req().generatePairingCode({}),

  revokeControlToken: async (token: string) => {
    await req().revokeControlToken({ token })
    queryClient.invalidateQueries({ queryKey: queryKeys.controlTokens() })
  },
}

export const logs = {
  openFolder: () => req().openLogsFolder({}),

  openFile: () => req().openLogFile({}),

  clear: async () => {
    await req().clearLogs({})
    queryClient.invalidateQueries({ queryKey: queryKeys.logInfo() })
  },
}
