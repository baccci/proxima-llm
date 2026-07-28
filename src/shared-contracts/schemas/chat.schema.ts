import { z } from 'zod'
import { Effort } from '../models/effort'
import { ToolDecision } from '../tools/tool-policy'

// Default title for a chat with no user-set name. Also the sentinel the auto-title
// pass checks to know a chat is still unnamed, so it lives here as the one source.
export const DEFAULT_CHAT_TITLE = 'New Chat'

export const ChatComposerState = z
  .object({
    thinking: z.boolean().default(false),
    webSearch: z.boolean().default(false),
    effort: Effort.nullable().default(null),
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
