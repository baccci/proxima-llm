import type { MessagePart } from '@shared/schemas/message.schema'
import { create } from 'zustand'

export interface StreamingToolCall {
  toolCallId: string
  toolName: string
  input: unknown
  output?: unknown
  awaitingApproval: boolean
}

export interface StreamingSource {
  url: string
  title?: string
}

export interface StreamingMessage {
  id: string
  streamId: string
  textParts: string
  reasoningParts: string
  reasoningStartedAt: number | null
  reasoningEndedAt: number | null
  toolCalls: StreamingToolCall[]
  sources: StreamingSource[]
  done: boolean
  error: string | null
}

interface PendingIncoming {
  chatId: string
  streamId: string
  assistantMessageId: string
}

interface ChatUIState {
  selectedChatId: string | null
  thinkingExpanded: Record<string, boolean>
  streaming: StreamingMessage | null
  settingsOpen: boolean
  sidebarOpen: boolean
  focusModeOpen: boolean
  focusModeExchangeIndex: number
  focusModeShowPrompt: boolean
  pendingIncoming: PendingIncoming | null

  selectChat: (id: string | null) => void
  setThinkingExpanded: (messageId: string, expanded: boolean) => void
  startStreaming: (streamId: string, assistantMessageId: string) => void
  appendTextDelta: (delta: string) => void
  appendReasoningDelta: (delta: string) => void
  addToolCall: (toolCallId: string, toolName: string, input: unknown) => void
  resolveToolCall: (toolCallId: string, output: unknown) => void
  setToolCallAwaitingApproval: (toolCallId: string) => void
  addSource: (url: string, title?: string) => void
  finishStreaming: () => void
  setStreamingError: (error: string) => void
  failStreaming: (error: string) => void
  setSettingsOpen: (open: boolean) => void
  toggleSidebar: () => void
  setFocusModeOpen: (open: boolean) => void
  setFocusModeExchangeIndex: (i: number) => void
  setFocusModeShowPrompt: (show: boolean) => void
  setPendingIncoming: (p: PendingIncoming | null) => void
}

export const useChatStore = create<ChatUIState>((set) => ({
  selectedChatId: null,
  thinkingExpanded: {},
  streaming: null,
  settingsOpen: false,
  sidebarOpen: true,
  focusModeOpen: false,
  focusModeExchangeIndex: 0,
  focusModeShowPrompt: false,
  pendingIncoming: null,

  selectChat: (id) => set({ selectedChatId: id, streaming: null, pendingIncoming: null }),

  setThinkingExpanded: (messageId, expanded) =>
    set((s) => ({ thinkingExpanded: { ...s.thinkingExpanded, [messageId]: expanded } })),

  startStreaming: (streamId, assistantMessageId) =>
    set({
      streaming: {
        id: assistantMessageId,
        streamId,
        textParts: '',
        reasoningParts: '',
        reasoningStartedAt: null,
        reasoningEndedAt: null,
        toolCalls: [],
        sources: [],
        done: false,
        error: null,
      },
    }),

  appendTextDelta: (delta) =>
    set((s) => {
      if (!s.streaming) return {}
      const reasoningEndedAt =
        s.streaming.reasoningStartedAt !== null && s.streaming.reasoningEndedAt === null
          ? Date.now()
          : s.streaming.reasoningEndedAt
      return {
        streaming: { ...s.streaming, textParts: s.streaming.textParts + delta, reasoningEndedAt },
      }
    }),

  appendReasoningDelta: (delta) =>
    set((s) =>
      s.streaming
        ? {
            streaming: {
              ...s.streaming,
              reasoningParts: s.streaming.reasoningParts + delta,
              reasoningStartedAt: s.streaming.reasoningStartedAt ?? Date.now(),
            },
          }
        : {},
    ),

  addToolCall: (toolCallId, toolName, input) =>
    set((s) =>
      s.streaming
        ? {
            streaming: {
              ...s.streaming,
              toolCalls: [
                ...s.streaming.toolCalls,
                { toolCallId, toolName, input, awaitingApproval: false },
              ],
            },
          }
        : {},
    ),

  resolveToolCall: (toolCallId, output) =>
    set((s) =>
      s.streaming
        ? {
            streaming: {
              ...s.streaming,
              toolCalls: s.streaming.toolCalls.map((tc) =>
                tc.toolCallId === toolCallId ? { ...tc, output, awaitingApproval: false } : tc,
              ),
            },
          }
        : {},
    ),

  setToolCallAwaitingApproval: (toolCallId) =>
    set((s) =>
      s.streaming
        ? {
            streaming: {
              ...s.streaming,
              toolCalls: s.streaming.toolCalls.map((tc) =>
                tc.toolCallId === toolCallId ? { ...tc, awaitingApproval: true } : tc,
              ),
            },
          }
        : {},
    ),

  finishStreaming: () =>
    set((s) => {
      if (!s.streaming) return {}
      const reasoningEndedAt =
        s.streaming.reasoningStartedAt !== null && s.streaming.reasoningEndedAt === null
          ? Date.now()
          : s.streaming.reasoningEndedAt
      return { streaming: { ...s.streaming, done: true, reasoningEndedAt } }
    }),

  addSource: (url, title) =>
    set((s) =>
      s.streaming
        ? { streaming: { ...s.streaming, sources: [...s.streaming.sources, { url, title }] } }
        : {},
    ),

  setStreamingError: (error) =>
    set((s) => (s.streaming ? { streaming: { ...s.streaming, done: true, error } } : {})),

  failStreaming: (error) =>
    set({
      streaming: {
        id: crypto.randomUUID(),
        streamId: '',
        textParts: '',
        reasoningParts: '',
        reasoningStartedAt: null,
        reasoningEndedAt: null,
        toolCalls: [],
        sources: [],
        done: true,
        error,
      },
    }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setFocusModeOpen: (open) => set({ focusModeOpen: open }),
  setFocusModeExchangeIndex: (i) => set({ focusModeExchangeIndex: i }),
  setFocusModeShowPrompt: (show) => set({ focusModeShowPrompt: show }),
  setPendingIncoming: (p) => set({ pendingIncoming: p }),
}))

export function streamingToParts(msg: StreamingMessage): MessagePart[] {
  const parts: MessagePart[] = []
  if (msg.reasoningParts) parts.push({ type: 'reasoning', text: msg.reasoningParts })
  if (msg.textParts) parts.push({ type: 'text', text: msg.textParts })
  return parts
}
