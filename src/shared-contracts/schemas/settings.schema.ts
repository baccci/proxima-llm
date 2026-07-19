import { z } from 'zod'

// The app color theme. Stored in the settings blob, so renaming a member is a
// data migration, not a find and replace.
export const Theme = z.enum(['light', 'dark', 'system'])
export type Theme = z.infer<typeof Theme>

// Chat text scale. Stored in settings, so member renames are migrations too.
export const FontSize = z.enum(['sm', 'md', 'lg'])
export type FontSize = z.infer<typeof FontSize>

// How a provider picks its title model: `auto` = cheapest enabled model,
// `custom` = the pinned modelId. Stored inside the titleModels blob, so renames
// are migrations.
export const TitleMode = z.enum(['auto', 'custom'])
export type TitleMode = z.infer<typeof TitleMode>

// Per-provider model used to auto-name new chats. `auto` = cheapest enabled
// model in that provider (resolved at runtime). `custom` + modelId pins one,
// but a dead/disabled id silently falls back to auto. modelId is retained even
// in auto mode so toggling the radio doesn't lose the previous pick.
export const ProviderTitleConfig = z.object({
  mode: TitleMode,
  modelId: z.string().nullable(),
})

export type ProviderTitleConfig = z.infer<typeof ProviderTitleConfig>

export const SettingsDTO = z.object({
  defaultModelId: z.string().nullable(),
  theme: Theme,
  fontSize: FontSize,
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
  theme: Theme.enum.system,
  fontSize: FontSize.enum.md,
  sendOnEnter: true,
  maxRetries: 1,
  requestTimeoutMs: 60_000,
  controlServerEnabled: false,
  controlServerPort: 7865,
  focusFollowsIncoming: true,
  titleModels: {},
}
