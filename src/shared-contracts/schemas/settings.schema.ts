import { z } from 'zod'

// Per-provider model used to auto-name new chats. `auto` = cheapest enabled
// model in that provider (resolved at runtime). `custom` + modelId pins one,
// but a dead/disabled id silently falls back to auto. modelId is retained even
// in auto mode so toggling the radio doesn't lose the previous pick.
export const ProviderTitleConfig = z.object({
  mode: z.enum(['auto', 'custom']),
  modelId: z.string().nullable(),
})

export type ProviderTitleConfig = z.infer<typeof ProviderTitleConfig>

export const SettingsDTO = z.object({
  defaultModelId: z.string().nullable(),
  theme: z.enum(['light', 'dark', 'system']),
  fontSize: z.enum(['sm', 'md', 'lg']),
  sendOnEnter: z.boolean(),
  maxRetries: z.number().int().min(0).max(5),
  requestTimeoutMs: z.number().int().min(1000),
  controlServerEnabled: z.boolean(),
  controlServerPort: z.number().int().min(1024).max(65535),
  focusFollowsIncoming: z.boolean(),
  titleModels: z.record(z.string(), ProviderTitleConfig).default({}),
})

export type SettingsDTO = z.infer<typeof SettingsDTO>

export const UpdateSettingsInput = SettingsDTO.partial()
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>

export const DEFAULT_SETTINGS: SettingsDTO = {
  defaultModelId: null,
  theme: 'system',
  fontSize: 'md',
  sendOnEnter: true,
  maxRetries: 1,
  requestTimeoutMs: 60_000,
  controlServerEnabled: false,
  controlServerPort: 7865,
  focusFollowsIncoming: true,
  titleModels: {},
}
