import type { ChatDTO } from '@shared/schemas/chat.schema'
import { type MessageDTO, MessageRole, StopReason } from '@shared/schemas/message.schema'
import React from 'react'
import {
  extractReasoningPart,
  extractSourceParts,
  extractTextParts,
} from '@/features/chat/helpers/message-parts'
import { useMessageActions } from '@/features/chat/hooks/use-message-actions'
import { messageToText } from '@/features/chat/lib/copy-message'
import { MessageActions } from './message-actions'
import { MessagePartRenderer } from './message-part-renderer'
import { SourcesBlock } from './sources-block'
import { ThinkingBlock } from './thinking-block'

type MessageBubbleProps = {
  message: MessageDTO
  chatItem: ChatDTO
  streaming?: boolean
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  chatItem,
  streaming,
}: MessageBubbleProps) {
  const isUser = message.role === MessageRole.enum.user
  const isOptimistic = message.id.startsWith('optimistic-')
  const reasoningPart = extractReasoningPart(message.parts)
  const textParts = extractTextParts(message.parts)
  const sourceParts = extractSourceParts(message.parts)

  const { retry, saveEdit, copy, isStreamingActive } = useMessageActions(chatItem)

  const [editing, setEditing] = React.useState(false)
  const [editText, setEditText] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const EDIT_MAX_H = 272

  function startEdit() {
    setEditText(messageToText(message.parts))
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  function handleSaveEdit() {
    const trimmed = editText.trim()
    if (!trimmed) return
    setEditing(false)
    saveEdit(message.id, trimmed)
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, EDIT_MAX_H)}px`
  }

  if (isUser) {
    return (
      <div className="group flex flex-col items-end mb-4">
        {editing ? (
          <div className="max-w-[70%] w-full flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => {
                setEditText(e.target.value)
                autoResize(e.target)
              }}
              onKeyDown={handleEditKeyDown}
              rows={3}
              className="w-full resize-none overflow-y-auto rounded-bubble bg-user-bubble text-user-bubble-foreground px-4 py-3 text-base outline-none"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm rounded-lg text-subtle hover:text-foreground hover:bg-surface-hover transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 text-sm rounded-lg bg-brand text-brand-foreground hover:bg-brand-hover transition"
              >
                Save & send
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[70%] rounded-bubble bg-user-bubble text-user-bubble-foreground px-4 py-3 text-base">
            {textParts.map((part, i) => (
              <MessagePartRenderer key={i} part={part} />
            ))}
          </div>
        )}

        {!isOptimistic && !editing && (
          // Reveal on hover/focus with opacity only, no transition. opacity-0 keeps the
          // buttons keyboard-tabbable, and animating opacity to 0 leaves a stale WebKit
          // paint layer (ghost buttons). See local-docs/slices/webkit-quirks.md
          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 mt-0.5">
            <MessageActions
              canEdit
              parts={message.parts}
              disabled={isStreamingActive}
              onRetry={() => retry(message.id)}
              onEdit={startEdit}
              onCopy={() => copy(message.parts)}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="group mb-6">
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
        {(message.usage || !isOptimistic) && (
          <div className="mt-2 flex items-center gap-3 text-2xs text-subtle">
            {message.usage && (
              <>
                <span>{message.usage.inputTokens.toLocaleString()} in</span>
                <span>{message.usage.outputTokens.toLocaleString()} out</span>
                {message.usage.cacheReadTokens != null && (
                  <span>{message.usage.cacheReadTokens.toLocaleString()} cached</span>
                )}
              </>
            )}
            {!isOptimistic && (
              // Same opacity-only reveal as the user branch. See webkit-quirks.md
              <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                <MessageActions
                  canEdit={false}
                  parts={message.parts}
                  disabled={isStreamingActive}
                  onCopy={() => copy(message.parts)}
                />
              </div>
            )}
          </div>
        )}
        {message.stopReason && (
          <div className="mt-1.5 text-2xs text-subtle/70">
            {message.stopReason === StopReason.enum['user-cancel'] ? 'Interrupted' : 'Timed out'}
          </div>
        )}
      </div>
    </div>
  )
})
