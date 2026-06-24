import type { MessageDTO } from '@shared/schemas/message.schema'
import React from 'react'
import {
  extractReasoningPart,
  extractSourceParts,
  extractTextParts,
  MessagePartRenderer,
} from '@/features/chat/entities/parts'
import { SourcesBlock } from './sources-block'
import { ThinkingBlock } from './thinking-block'

interface Props {
  message: MessageDTO
  streaming?: boolean
}

export const MessageBubble = React.memo(function MessageBubble({ message, streaming }: Props) {
  const isUser = message.role === 'user'
  const reasoningPart = extractReasoningPart(message.parts)
  const textParts = extractTextParts(message.parts)
  const sourceParts = extractSourceParts(message.parts)

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[70%] rounded-bubble bg-user-bubble text-user-bubble-foreground px-4 py-3 text-base">
          {textParts.map((part, i) => (
            <MessagePartRenderer key={i} part={part} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6">
      {reasoningPart && (
        <ThinkingBlock
          messageId={message.id}
          reasoning={reasoningPart.text}
          active={false}
          durationLabel={
            reasoningPart.durationMs != null
              ? `${Math.round(reasoningPart.durationMs / 1000)}s`
              : undefined
          }
        />
      )}
      <div className="text-base text-foreground leading-relaxed">
        {textParts.map((part, i) => (
          <MessagePartRenderer key={i} part={part} streaming={streaming} allParts={message.parts} />
        ))}
        <SourcesBlock sources={sourceParts} />
        {message.usage && (
          <div className="mt-2 flex gap-3 text-2xs text-subtle">
            <span>{message.usage.inputTokens.toLocaleString()} in</span>
            <span>{message.usage.outputTokens.toLocaleString()} out</span>
            {message.usage.cacheReadTokens != null && (
              <span>{message.usage.cacheReadTokens.toLocaleString()} cached</span>
            )}
          </div>
        )}
        {message.stopReason && (
          <div className="mt-1.5 text-2xs text-subtle/70">
            {message.stopReason === 'user-cancel' ? 'Interrupted' : 'Timed out'}
          </div>
        )}
      </div>
    </div>
  )
})
