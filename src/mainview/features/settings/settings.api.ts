import type { UpdateSettingsInput } from '@shared/schemas/settings.schema'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { rpcRequest as req } from '@/lib/rpc.client'

export const settings = {
  get: () =>
    queryClient.fetchQuery({
      queryKey: queryKeys.settings(),
      queryFn: () => req().getSettings({}),
    }),

  update: async (input: UpdateSettingsInput) => {
    const updated = await req().updateSettings(input)
    queryClient.invalidateQueries({ queryKey: queryKeys.settings() })
    return updated
  },

  getApiKeyStatus: (provider: string) =>
    queryClient.fetchQuery({
      queryKey: queryKeys.apiKey(provider),
      queryFn: () => req().hasApiKey({ provider }),
    }),

  setApiKey: async (provider: string, key: string) => {
    await req().setApiKey({ provider, key })
    queryClient.invalidateQueries({ queryKey: queryKeys.apiKey(provider) })
  },

  generatePairingCode: () => req().generatePairingCode({}),

  listControlTokens: () =>
    queryClient.fetchQuery({
      queryKey: queryKeys.controlTokens(),
      queryFn: () => req().listControlTokens({}),
    }),

  revokeControlToken: async (token: string) => {
    await req().revokeControlToken({ token })
    queryClient.invalidateQueries({ queryKey: queryKeys.controlTokens() })
  },

  syncModels: () => req().syncModels({}),
}

export const logs = {
  getInfo: () =>
    queryClient.fetchQuery({
      queryKey: queryKeys.logInfo(),
      queryFn: () => req().getLogInfo({}),
    }),

  openFolder: () => req().openLogsFolder({}),

  openFile: () => req().openLogFile({}),

  clear: async () => {
    await req().clearLogs({})
    queryClient.invalidateQueries({ queryKey: queryKeys.logInfo() })
  },

  logClientError: (input: { msg: string; stack?: string; context?: Record<string, unknown> }) =>
    req().logClientError(input),
}
