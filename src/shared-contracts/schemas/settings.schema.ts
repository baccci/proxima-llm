import { z } from 'zod'

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
}
