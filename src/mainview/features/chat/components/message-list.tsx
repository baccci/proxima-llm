import type { ChatDTO } from '@shared/schemas/chat.schema'
import { type MessageDTO, PartKind } from '@shared/schemas/message.schema'
import { isSilentTool } from '@shared/tools/tool-catalog'
import { ToolDecision } from '@shared/tools/tool-policy'
import { formatSeconds } from '@utils/format-duration'
import React from 'react'
import { IconChevronDown } from '@/components/icons/icon-chevron-down'
import { useAutoScroll } from '@/features/chat/hooks/use-auto-scroll'
import { type StreamingMessage, useChatStore } from '@/features/chat/store/chat.store'
import { rpcRequest } from '@/lib/rpc.client'
import { MessageBubble } from './message-bubble'
import { MessagePartRenderer } from './message-part-renderer'
import { SourcesBlock } from './sources-block'
import { ThinkingBlock } from './thinking-block'
import { ToolCallBlock } from './tool-call-block'

type MessageListProps = {
  messages: MessageDTO[]
  chatItem: ChatDTO
  compactedThroughAt?: string | null
}

// Rough token estimate for the live reasoning counter: about 4 characters per token.
const CHARS_PER_TOKEN = 4

type StreamingMessageViewProps = {
  streaming: StreamingMessage
}

// The in-progress assistant turn: live reasoning, tool calls (awaiting approval or
// resolved), the streaming text or a blinking cursor before the first token, and sources.
function StreamingMessageView({ streaming }: StreamingMessageViewProps) {
  return (
    <div className="mb-6">
      {streaming.reasoningParts && (
        <ThinkingBlock
          messageId={streaming.id}
          reasoning={streaming.reasoningParts}
          active={!!streaming.reasoningStartedAt && !streaming.reasoningEndedAt}
          tokenEstimate={Math.ceil(streaming.reasoningParts.length / CHARS_PER_TOKEN)}
          durationLabel={
            streaming.reasoningStartedAt && streaming.reasoningEndedAt
              ? formatSeconds(streaming.reasoningEndedAt - streaming.reasoningStartedAt)
              : undefined
          }
        />
      )}

      {streaming.toolCalls
        .filter((tc) => !isSilentTool(tc.toolName))
        .map((tc) => (
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
                decision: ToolDecision.enum.allow,
                remember,
              })
            }
            onDeny={(remember) =>
              rpcRequest().resolveToolApproval({
                streamId: streaming.streamId,
                toolCallId: tc.toolCallId,
                decision: ToolDecision.enum.deny,
                remember,
              })
            }
          />
        ))}

      <div className="text-base text-foreground leading-relaxed">
        {streaming.textParts ? (
          <MessagePartRenderer
            part={{ type: PartKind.enum.text, text: streaming.textParts }}
            streaming
          />
        ) : (
          streaming.toolCalls.length === 0 && (
            <span className="inline-block w-2 h-4 bg-brand rounded-sm animate-pulse" />
          )
        )}
      </div>
      <SourcesBlock sources={streaming.sources} />
    </div>
  )
}

export function MessageList({ messages, chatItem, compactedThroughAt }: MessageListProps) {
  const streaming = useChatStore((s) => s.streaming)
  const compactingChatId = useChatStore((s) => s.compactingChatId)
  // Label shows for both auto-compaction (stream chunk) and a manual ring click
  // (store flag, no stream).
  const showCompacting = streaming?.compacting || compactingChatId === chatItem.id
  const { scrollRef, bottomRef, showScrollToBottom, handleScroll, scrollToBottom } = useAutoScroll({
    messageCount: messages.length,
    streamingText: streaming?.textParts,
  })

  // The id of the last message covered by the rolling summary. Everything up to
  // and including it is sent to the model as a compact summary, not in full, so we
  // render a divider after it to mark the boundary. The DB still keeps every
  // message, so the full history stays readable above the line.
  const compactedThroughId = React.useMemo(() => {
    if (!compactedThroughAt) {
      return null
    }
    let id: string | null = null
    for (const m of messages) {
      if (m.createdAt > compactedThroughAt) {
        break
      }
      id = m.id
    }
    return id
  }, [messages, compactedThroughAt])

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overflow-x-hidden"
      >
        <div className="max-w-(--layout-content-w) mx-auto px-6 pb-8 pt-20">
          {messages.map((msg) => (
            <React.Fragment key={msg.id}>
              <MessageBubble message={msg} chatItem={chatItem} />
              {msg.id === compactedThroughId && (
                <div className="flex items-center gap-3 my-6 select-none" aria-hidden>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-subtle whitespace-nowrap">
                    Earlier messages summarized to save context
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Compaction label, auto (during a stream) or manual (ring click). */}
          {showCompacting && (
            <div className="mb-6 flex items-center gap-2 text-sm text-subtle">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-subtle animate-pulse" />
              <span>Compacting earlier messages…</span>
            </div>
          )}

          {/* Streaming assistant message */}
          {streaming && !streaming.done && <StreamingMessageView streaming={streaming} />}

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
            className="pointer-events-auto flex items-center gap-1 pl-3 pr-3.5 py-1.5 rounded-full border text-sm transition-colors backdrop-blur-2xl bg-floating text-floating-foreground border-floating-border hover:bg-floating-hover shadow-pop"
          >
            <IconChevronDown width={14} />
            <span>Scroll to bottom</span>
          </button>
        </div>
      )}
    </div>
  )
}
