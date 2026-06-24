import { z } from 'zod'

export const ModelCapabilities = z.object({
  thinking: z.boolean(),
  vision: z.boolean(),
  pdf: z.boolean(),
  tools: z.boolean(),
  promptCaching: z.boolean(),
  webSearch: z.boolean().default(false),
  maxOutputTokens: z.number().int().positive(),
  contextWindow: z.number().int().positive().optional(),
  defaultThinkingBudget: z.number().int().positive().optional(),
})

export type ModelCapabilities = z.infer<typeof ModelCapabilities>

export const ModelDTO = z.object({
  id: z.string(),
  provider: z.string(),
  family: z.string(),
  displayName: z.string(),
  capabilities: ModelCapabilities,
  isCustom: z.boolean(),
  isEnabled: z.boolean(),
  pricing: z.object({ prompt: z.number(), completion: z.number() }).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ModelDTO = z.infer<typeof ModelDTO>

export type ModelDefinition = Omit<ModelDTO, 'createdAt' | 'updatedAt'>
