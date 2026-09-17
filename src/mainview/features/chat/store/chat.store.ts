import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import { create } from 'zustand'

export type StreamingToolCall = {
  toolCallId: string
  toolName: string
  input: unknown
  output?: unknown
  awaitingApproval: boolean
}

export type StreamingSource = {
  url: string
  title?: string
}

export type StreamingMessage = {
  id: string
  streamId: string
  textParts: string
  reasoningParts: string
  reasoningStartedAt: number | null
  reasoningEndedAt: number | null
  toolCalls: StreamingToolCall[]
  sources: StreamingSource[]
  compacting: boolean
  done: boolean
  error: string | null
}

// An empty streaming message. startStreaming seeds a live one; failStreaming
// seeds a done-with-error one on top of the same scaffold.
function blankStreaming(id: string, streamId: string): StreamingMessage {
  return {
    id,
    streamId,
    textParts: '',
    reasoningParts: '',
    reasoningStartedAt: null,
    reasoningEndedAt: null,
    toolCalls: [],
    sources: [],
    compacting: false,
    done: false,
    error: null,
  }
}

// Stamp the moment reasoning stops, the first time text or a done signal arrives
// after reasoning began. Once stamped it never moves.
function closeReasoningClock(streaming: StreamingMessage): number | null {
  const started = streaming.reasoningStartedAt !== null
  const stillOpen = streaming.reasoningEndedAt === null
  if (started && stillOpen) {
    return Date.now()
  }
  return streaming.reasoningEndedAt
}

// Add a tool call, or patch it in place if we already have one with this id.
function upsertToolCall(
  toolCalls: StreamingToolCall[],
  toolCallId: string,
  patch: Partial<StreamingToolCall>,
  newCall: StreamingToolCall,
): StreamingToolCall[] {
  const exists = toolCalls.some((tc) => tc.toolCallId === toolCallId)
  if (!exists) {
    return [...toolCalls, newCall]
  }
  return toolCalls.map((tc) => (tc.toolCallId === toolCallId ? { ...tc, ...patch } : tc))
}

type ChatUIState = {
  thinkingExpanded: Record<string, boolean>
  streaming: StreamingMessage | null
  // Chat id currently running a manual (non-stream) compaction, so the message
  // list can show the "Compacting…" label outside the stream pipeline.
  compactingChatId: string | null
  resetForChatChange: () => void
  setThinkingExpanded: (messageId: string, expanded: boolean) => void
  startStreaming: (streamId: string, assistantMessageId: string) => void
  appendTextDelta: (delta: string) => void
  appendReasoningDelta: (delta: string) => void
  addToolCall: (toolCallId: string, toolName: string, input: unknown) => void
  resolveToolCall: (toolCallId: string, output: unknown) => void
  setToolCallAwaitingApproval: (toolCallId: string, toolName: string, input: unknown) => void
  addSource: (url: string, title?: string) => void
  setCompacting: (active: boolean) => void
  setCompactingChatId: (chatId: string | null) => void
  finishStreaming: () => void
  setStreamingError: (error: string) => void
  failStreaming: (error: string) => void
}

export const useChatStore = create<ChatUIState>((set) => ({
  thinkingExpanded: {},
  streaming: null,
  compactingChatId: null,

  // Called when navigation opens a different chat: the live stream belongs to the
  // chat being left.
  resetForChatChange: () => set({ streaming: null }),

  setThinkingExpanded: (messageId, expanded) =>
    set((s) => ({ thinkingExpanded: { ...s.thinkingExpanded, [messageId]: expanded } })),

  startStreaming: (streamId, assistantMessageId) =>
    set({ streaming: blankStreaming(assistantMessageId, streamId) }),

  appendTextDelta: (delta) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return {
        streaming: {
          ...s.streaming,
          textParts: s.streaming.textParts + delta,
          reasoningEndedAt: closeReasoningClock(s.streaming),
        },
      }
    }),

  appendReasoningDelta: (delta) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return {
        streaming: {
          ...s.streaming,
          reasoningParts: s.streaming.reasoningParts + delta,
          reasoningStartedAt: s.streaming.reasoningStartedAt ?? Date.now(),
        },
      }
    }),

  addToolCall: (toolCallId, toolName, input) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      const toolCalls = upsertToolCall(
        s.streaming.toolCalls,
        toolCallId,
        { toolName, input },
        { toolCallId, toolName, input, awaitingApproval: false },
      )
      return { streaming: { ...s.streaming, toolCalls } }
    }),

  resolveToolCall: (toolCallId, output) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return {
        streaming: {
          ...s.streaming,
          toolCalls: s.streaming.toolCalls.map((tc) =>
            tc.toolCallId === toolCallId ? { ...tc, output, awaitingApproval: false } : tc,
          ),
        },
      }
    }),

  setToolCallAwaitingApproval: (toolCallId, toolName, input) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      const toolCalls = upsertToolCall(
        s.streaming.toolCalls,
        toolCallId,
        { awaitingApproval: true },
        { toolCallId, toolName, input, awaitingApproval: true },
      )
      return { streaming: { ...s.streaming, toolCalls } }
    }),

  finishStreaming: () =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return {
        streaming: {
          ...s.streaming,
          done: true,
          reasoningEndedAt: closeReasoningClock(s.streaming),
        },
      }
    }),

  addSource: (url, title) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return { streaming: { ...s.streaming, sources: [...s.streaming.sources, { url, title }] } }
    }),

  setCompacting: (active) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return { streaming: { ...s.streaming, compacting: active } }
    }),

  setCompactingChatId: (chatId) => set({ compactingChatId: chatId }),

  setStreamingError: (error) =>
    set((s) => {
      if (!s.streaming) {
        return {}
      }
      return { streaming: { ...s.streaming, done: true, error } }
    }),

  failStreaming: (error) =>
    set({ streaming: { ...blankStreaming(crypto.randomUUID(), ''), done: true, error } }),
}))

export function streamingToParts(msg: StreamingMessage): MessagePart[] {
  const parts: MessagePart[] = []
  if (msg.reasoningParts) {
    parts.push({ type: PartKind.enum.reasoning, text: msg.reasoningParts })
  }
  if (msg.textParts) {
    parts.push({ type: PartKind.enum.text, text: msg.textParts })
  }
  return parts
}
