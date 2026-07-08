import { z } from 'zod'

export const MessageRole = z.enum(['user', 'assistant', 'system'])
export type MessageRole = z.infer<typeof MessageRole>

export const MessagePart = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('reasoning'),
    text: z.string(),
    durationMs: z.number().int().optional(),
  }),
  z.object({ type: z.literal('image'), attachmentId: z.string() }),
  z.object({ type: z.literal('file'), attachmentId: z.string(), mediaType: z.string() }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    output: z.unknown(),
  }),
  z.object({
    type: z.literal('source'),
    url: z.string(),
    title: z.string().optional(),
  }),
])

export type MessagePart = z.infer<typeof MessagePart>

export const StopReason = z.enum(['user-cancel', 'idle-timeout'])
export type StopReason = z.infer<typeof StopReason>

export const TokenUsage = z.object({
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int().optional(),
  cacheWriteTokens: z.number().int().optional(),
})

export type TokenUsage = z.infer<typeof TokenUsage>

export const MessageDTO = z.object({
  id: z.string(),
  chatId: z.string(),
  role: MessageRole,
  parts: z.array(MessagePart),
  modelId: z.string().nullable(),
  usage: TokenUsage.nullable(),
  stopReason: StopReason.optional(),
  createdAt: z.string().datetime(),
})

export type MessageDTO = z.infer<typeof MessageDTO>
