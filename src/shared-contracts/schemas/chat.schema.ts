import { z } from 'zod'
import { ToolDecision } from '../tools/tool-policy'

export const ChatComposerState = z
  .object({
    thinking: z.boolean().default(false),
    webSearch: z.boolean().default(false),
    effort: z.string().nullable().default(null),
    toolGrants: z.record(z.string(), ToolDecision).default({}),
  })
  .default({})

export type ChatComposerState = z.infer<typeof ChatComposerState>

export const ChatDTO = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  pinned: z.boolean(),
  modelId: z.string().nullable(),
  composer: ChatComposerState,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastMessageAt: z.string().datetime(),
})

export type ChatDTO = z.infer<typeof ChatDTO>

export const CreateChatInput = z.object({
  projectId: z.string().nullable().optional(),
  title: z.string().optional(),
  modelId: z.string().optional(),
  composer: ChatComposerState.optional(),
})

export type CreateChatInput = z.infer<typeof CreateChatInput>
