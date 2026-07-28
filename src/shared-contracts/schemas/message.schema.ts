import { z } from 'zod'
import { Effort } from '../models/effort'

// Who authored a message. Compare with MessageRole.enum.user (not a bare string)
// so a reader knows the value is a role. Persisted as literal text in the messages
// table, so renaming a member is a DB migration.
export const MessageRole = z.enum(['user', 'assistant', 'system'])
export type MessageRole = z.infer<typeof MessageRole>

// The kind tag on a MessagePart. Each MessagePart branch reads its literal from
// here, so this enum is the single roster of part kinds. Persisted as literal
// text inside messages.parts JSON, so renaming a member is a DB migration, not a
// free rename. Compare with PartKind.enum.text (never a bare string) so a reader
// can tell the value is a part kind and jump here for the full set.
export const PartKind = z.enum([
  'text',
  'reasoning',
  'image',
  'file',
  'tool-call',
  'tool-result',
  'source',
])
export type PartKind = z.infer<typeof PartKind>

export const MessagePart = z.discriminatedUnion('type', [
  z.object({ type: z.literal(PartKind.enum.text), text: z.string() }),
  z.object({
    type: z.literal(PartKind.enum.reasoning),
    text: z.string(),
    durationMs: z.number().int().optional(),
  }),
  z.object({ type: z.literal(PartKind.enum.image), attachmentId: z.string() }),
  z.object({
    type: z.literal(PartKind.enum.file),
    attachmentId: z.string(),
    mediaType: z.string(),
  }),
  z.object({
    type: z.literal(PartKind.enum['tool-call']),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
  }),
  z.object({
    type: z.literal(PartKind.enum['tool-result']),
    toolCallId: z.string(),
    toolName: z.string(),
    output: z.unknown(),
  }),
  z.object({
    type: z.literal(PartKind.enum.source),
    url: z.string(),
    title: z.string().optional(),
  }),
])

export type MessagePart = z.infer<typeof MessagePart>

// Why a stream ended early, when it did not finish on its own. Compare with
// StopReason.enum['user-cancel']. Persisted as literal text, so a rename is a
// DB migration.
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

export const SendMessageInput = z.object({
  chatId: z.string(),
  modelId: z.string(),
  content: z.string(),
  thinking: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  effort: Effort.nullish(),
  attachmentIds: z.array(z.string()).optional(),
})

export type SendMessageInput = z.infer<typeof SendMessageInput>

export const RetryMessageInput = z.object({
  chatId: z.string(),
  modelId: z.string(),
  userMessageId: z.string(),
  content: z.string().optional(),
  thinking: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  effort: Effort.nullish(),
})

export type RetryMessageInput = z.infer<typeof RetryMessageInput>
