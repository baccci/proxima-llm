import type { MessageDTO } from '@shared/schemas/message.schema'
import { MessagePartRenderer } from '@/features/chat/components/message-part-renderer'
import { ThinkingBlock } from '@/features/chat/components/thinking-block'
import { extractReasoningPart, extractTextParts } from '@/features/chat/helpers/message-parts'
import type { StreamingMessage } from '@/features/chat/store/chat.store'
import type { Exchange } from '../entities/group-into-exchanges'

// True while this message is the one currently streaming in.
function isStreamingMessage(
  streaming: StreamingMessage | null,
  message: MessageDTO | null,
): boolean {
  return !!streaming && !streaming.done && message?.id === streaming.id
}

// Reasoning duration in whole seconds, e.g. "4s" — undefined while unknown.
function formatDuration(durationMs: number | null | undefined): string | undefined {
  return durationMs == null ? undefined : `${Math.round(durationMs / 1000)}s`
}

// The user's prompt, styled as the chat bubble; only shown when toggled on.
function PromptBlock({ exchange }: { exchange: Exchange | null }) {
  if (!exchange?.userMessage) return null
  return (
    <div className="mb-8 p-4 rounded-bubble bg-user-bubble text-user-bubble-foreground break-inside-avoid">
      <div className="text-sm">
        {extractTextParts(exchange.userMessage.parts).map((part, i) => (
          <MessagePartRenderer key={i} part={part} />
        ))}
      </div>
    </div>
  )
}

// Collapsible thinking trace, when the message has one.
function ReasoningBlock({ message, active }: { message: MessageDTO | null; active: boolean }) {
  const reasoning = message ? extractReasoningPart(message.parts) : null
  if (!message || !reasoning) return null
  return (
    <div className="break-inside-avoid">
      <ThinkingBlock
        messageId={message.id}
        reasoning={reasoning.text}
        active={active}
        durationLabel={formatDuration(reasoning.durationMs)}
      />
    </div>
  )
}

// The assistant's answer, or a placeholder when the turn has no response yet.
function ResponseBlock({ message, streaming }: { message: MessageDTO | null; streaming: boolean }) {
  if (!message) {
    return <p className="text-subtle italic text-base">No response yet.</p>
  }
  return (
    <div className="text-foreground">
      {extractTextParts(message.parts).map((part, i) => (
        <MessagePartRenderer
          key={i}
          part={part}
          streaming={streaming}
          allParts={message.parts}
          textClassName="leading-relaxed"
        />
      ))}
    </div>
  )
}

interface FocusModeContentProps {
  exchange: Exchange | null
  showPrompt: boolean
  streaming: StreamingMessage | null
}

export function FocusModeContent({ exchange, showPrompt, streaming }: FocusModeContentProps) {
  const assistantMessage = exchange?.assistantMessage ?? null
  const isStreaming = isStreamingMessage(streaming, assistantMessage)
  const reasoningActive = isStreaming && !streaming?.reasoningEndedAt

  return (
    <>
      {showPrompt && <PromptBlock exchange={exchange} />}
      <ReasoningBlock message={assistantMessage} active={reasoningActive} />
      <ResponseBlock message={assistantMessage} streaming={isStreaming} />
    </>
  )
}
