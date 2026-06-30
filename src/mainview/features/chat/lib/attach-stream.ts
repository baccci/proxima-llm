import { chat } from '@/features/chat/chat.api'
import { useChatStore } from '@/features/chat/store/chat.store'
import { subscribeToStream } from '@/lib/rpc.client'

/**
 * Subscribe to an already-running stream and drive the chat store's streaming
 * state. Used both by useStreamingMessage.send (normal flow) and by
 * onControlNavigate (externally-injected prompts).
 */
export function attachToStream(
  streamId: string,
  assistantMessageId: string,
  chatId: string,
): () => void {
  const {
    startStreaming,
    appendTextDelta,
    appendReasoningDelta,
    addSource,
    addToolCall,
    resolveToolCall,
    setToolCallAwaitingApproval,
    setCompacting,
    finishStreaming,
    setStreamingError,
  } = useChatStore.getState()

  startStreaming(streamId, assistantMessageId)

  return subscribeToStream(streamId, (chunk) => {
    if (chunk.kind === 'text-delta') {
      appendTextDelta(chunk.delta)
    } else if (chunk.kind === 'reasoning-delta') {
      appendReasoningDelta(chunk.delta)
    } else if (chunk.kind === 'source') {
      addSource(chunk.url, chunk.title)
    } else if (chunk.kind === 'tool-call') {
      addToolCall(chunk.toolCallId, chunk.toolName, chunk.input)
    } else if (chunk.kind === 'tool-result') {
      resolveToolCall(chunk.toolCallId, chunk.output)
    } else if (chunk.kind === 'tool-approval-request') {
      setToolCallAwaitingApproval(chunk.toolCallId, chunk.toolName, chunk.input)
    } else if (chunk.kind === 'compacting') {
      setCompacting(chunk.active)
    } else if (chunk.kind === 'done') {
      finishStreaming()
      chat.invalidateMessages(chunk.message?.chatId ?? chatId)
      chat.invalidateCompaction(chunk.message?.chatId ?? chatId)
      chat.invalidateList()
    } else if (chunk.kind === 'error') {
      setStreamingError(chunk.error)
      chat.invalidateMessages(chatId)
    }
  })
}
