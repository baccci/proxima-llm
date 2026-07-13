import type { MessageDTO } from '../schemas/message.schema'

// Discriminant vocab for the streaming transport. bun produces these chunks; the
// renderer and the SSE reader consume them. camelCase keys keep call sites clean
// while the wire values stay hyphenated. The union below derives its discriminants
// from this object, so this is the single source of truth for a chunk kind.
export const STREAM_CHUNK_KIND = {
  start: 'start',
  compacting: 'compacting',
  textDelta: 'text-delta',
  reasoningDelta: 'reasoning-delta',
  source: 'source',
  toolCall: 'tool-call',
  toolResult: 'tool-result',
  toolApprovalRequest: 'tool-approval-request',
  done: 'done',
  error: 'error',
} as const

export type StreamChunk =
  | { kind: typeof STREAM_CHUNK_KIND.start; assistantMessageId: string }
  | { kind: typeof STREAM_CHUNK_KIND.compacting; active: boolean }
  | { kind: typeof STREAM_CHUNK_KIND.textDelta; delta: string }
  | { kind: typeof STREAM_CHUNK_KIND.reasoningDelta; delta: string }
  | { kind: typeof STREAM_CHUNK_KIND.source; url: string; title?: string }
  | {
      kind: typeof STREAM_CHUNK_KIND.toolCall
      toolCallId: string
      toolName: string
      input: unknown
    }
  | { kind: typeof STREAM_CHUNK_KIND.toolResult; toolCallId: string; output: unknown }
  | {
      kind: typeof STREAM_CHUNK_KIND.toolApprovalRequest
      toolCallId: string
      toolName: string
      input: unknown
    }
  | { kind: typeof STREAM_CHUNK_KIND.done; message?: MessageDTO }
  | { kind: typeof STREAM_CHUNK_KIND.error; error: string }
