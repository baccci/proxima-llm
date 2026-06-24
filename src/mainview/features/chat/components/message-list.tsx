import type { MessageDTO } from '@shared/schemas/message.schema'
import React from 'react'
import { IconChevronDown } from '@/components/icons/icon-chevron-down'
import { MessagePartRenderer } from '@/features/chat/entities/parts'
import { useChatStore } from '@/features/chat/store/chat.store'
import { rpcRequest } from '@/lib/rpc.client'
import { MessageBubble } from './message-bubble'
import { SourcesBlock } from './sources-block'
import { ThinkingBlock } from './thinking-block'
import { ToolCallBlock } from './tool-call-block'

interface Props {
  messages: MessageDTO[]
}

export function MessageList({ messages }: Props) {
  const streaming = useChatStore((s) => s.streaming)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)

  function getDistanceFromBottom() {
    const el = scrollRef.current
    if (!el) return 0
    return el.scrollHeight - el.scrollTop - el.clientHeight
  }

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: streaming?.textParts is the trigger; getDistanceFromBottom reads a stable ref
  React.useEffect(() => {
    if (getDistanceFromBottom() < 120) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streaming?.textParts])

  function handleScroll() {
    setShowScrollToBottom(getDistanceFromBottom() > 120)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden"
      >
        <div className="max-w-[740px] mx-auto px-6 py-8">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming assistant message */}
          {streaming && !streaming.done && (
            <div className="mb-6">
              {streaming.reasoningParts && (
                <ThinkingBlock
                  messageId={streaming.id}
                  reasoning={streaming.reasoningParts}
                  active={!!streaming.reasoningStartedAt && !streaming.reasoningEndedAt}
                  tokenEstimate={Math.ceil(streaming.reasoningParts.length / 4)}
                  durationLabel={
                    streaming.reasoningStartedAt && streaming.reasoningEndedAt
                      ? `${Math.round((streaming.reasoningEndedAt - streaming.reasoningStartedAt) / 1000)}s`
                      : undefined
                  }
                />
              )}

              {streaming.toolCalls.map((tc) => (
                <ToolCallBlock
                  key={tc.toolCallId}
                  toolName={tc.toolName}
                  input={tc.input}
                  output={tc.output}
                  awaitingApproval={tc.awaitingApproval}
                  onApprove={(remember) =>
                    rpcRequest().resolveToolApproval({
                      streamId: streaming.streamId,
                      toolCallId: tc.toolCallId,
                      decision: 'allow',
                      remember,
                    })
                  }
                  onDeny={(remember) =>
                    rpcRequest().resolveToolApproval({
                      streamId: streaming.streamId,
                      toolCallId: tc.toolCallId,
                      decision: 'deny',
                      remember,
                    })
                  }
                />
              ))}

              <div className="text-base text-foreground leading-relaxed">
                {streaming.textParts ? (
                  <MessagePartRenderer
                    part={{ type: 'text', text: streaming.textParts }}
                    streaming
                  />
                ) : (
                  streaming.toolCalls.length === 0 && (
                    <span className="inline-block w-2 h-4 bg-accent-400 rounded-sm animate-pulse" />
                  )
                )}
              </div>
              <SourcesBlock sources={streaming.sources} />
            </div>
          )}

          {/* Streaming error */}
          {streaming?.error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger">
              {streaming.error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollToBottom && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <button
            onClick={scrollToBottom}
            className="pointer-events-auto flex items-center gap-1 pl-3 pr-3.5 py-1.5 rounded-full bg-elevated border border-border-strong text-sm text-foreground shadow-pop hover:bg-surface-hover transition-colors"
          >
            <IconChevronDown width={14} />
            <span>Scroll to bottom</span>
          </button>
        </div>
      )}
    </div>
  )
}
