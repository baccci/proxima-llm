import type { ChatDTO } from '@shared/schemas/chat.schema'
import { type MessageDTO, MessageRole, StopReason } from '@shared/schemas/message.schema'
import React from 'react'
import {
  extractReasoningPart,
  extractSourceParts,
  extractTextParts,
} from '@/features/chat/helpers/message-parts'
import { useAutoResizeTextarea } from '@/features/chat/hooks/use-auto-resize-textarea'
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

type UserMessageProps = {
  message: MessageDTO
  chatItem: ChatDTO
}

type UserMessageEditorProps = {
  message: MessageDTO
  onSave: (text: string) => void
  onCancel: () => void
}

type AssistantMessageProps = {
  message: MessageDTO
  chatItem: ChatDTO
  streaming?: boolean
}

export const MessageBubble = React.memo(function MessageBubble({
  message,
  chatItem,
  streaming,
}: MessageBubbleProps) {
  if (message.role === MessageRole.enum.user) {
    return <UserMessage message={message} chatItem={chatItem} />
  }

  return <AssistantMessage message={message} chatItem={chatItem} streaming={streaming} />
})

// The edit textarea plus save/cancel, seeded from the message's current text.
// Mounted only while editing, so it re-seeds each time editing opens.
function UserMessageEditor({ message, onSave, onCancel }: UserMessageEditorProps) {
  const [editText, setEditText] = React.useState(() => messageToText(message.parts))
  const { ref: textareaRef, autoResize } = useAutoResizeTextarea()

  function handleSave() {
    const trimmed = editText.trim()
    if (!trimmed) {
      return
    }
    onSave(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }

    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="max-w-[70%] w-full flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={editText}
        onChange={(e) => {
          setEditText(e.target.value)
          autoResize()
        }}
        onKeyDown={handleKeyDown}
        rows={3}
        className="w-full resize-none overflow-y-auto rounded-bubble bg-user-bubble text-user-bubble-foreground px-4 py-3 text-base outline-none"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg text-subtle hover:text-foreground hover:bg-surface-hover transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-sm rounded-lg bg-brand text-brand-foreground hover:bg-brand-hover transition"
        >
          Save & send
        </button>
      </div>
    </div>
  )
}

// The user's turn: the right-aligned bubble with hover actions, or the inline
// editor while editing.
function UserMessage({ message, chatItem }: UserMessageProps) {
  const { retry, saveEdit, copy, isStreamingActive } = useMessageActions(chatItem)
  const [editing, setEditing] = React.useState(false)

  const isOptimistic = message.id.startsWith('optimistic-')
  const textParts = extractTextParts(message.parts)

  if (editing) {
    return (
      <div className="group flex flex-col items-end mb-4">
        <UserMessageEditor
          message={message}
          onSave={(text) => {
            setEditing(false)
            saveEdit(message.id, text)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="group flex flex-col items-end mb-4">
      <div className="max-w-[70%] rounded-bubble bg-user-bubble text-user-bubble-foreground px-4 py-3 text-base">
        {textParts.map((part, i) => (
          <MessagePartRenderer key={i} part={part} />
        ))}
      </div>

      {!isOptimistic && (
        // Reveal on hover/focus with opacity only, no transition. opacity-0 keeps the
        // buttons keyboard-tabbable, and animating opacity to 0 leaves a stale WebKit
        // paint layer (ghost buttons). See local-docs/slices/webkit-quirks.md
        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 mt-0.5">
          <MessageActions
            canEdit
            parts={message.parts}
            disabled={isStreamingActive}
            onRetry={() => retry(message.id)}
            onEdit={() => setEditing(true)}
            onCopy={() => copy(message.parts)}
          />
        </div>
      )}
    </div>
  )
}

// The assistant's turn: reasoning trace, rendered text, sources, token usage,
// hover actions, and a stop-reason note when the turn ended early.
function AssistantMessage({ message, chatItem, streaming }: AssistantMessageProps) {
  const { copy, isStreamingActive } = useMessageActions(chatItem)

  const isOptimistic = message.id.startsWith('optimistic-')
  const reasoningPart = extractReasoningPart(message.parts)
  const textParts = extractTextParts(message.parts)
  const sourceParts = extractSourceParts(message.parts)

  return (
    <div className="group mb-6">
      {reasoningPart && (
        <ThinkingBlock
          messageId={message.id}
          reasoning={reasoningPart.text}
          active={false}
          durationMs={reasoningPart.durationMs}
        />
      )}
      <div className="text-base text-foreground leading-relaxed">
        {textParts.map((part, i) => (
          <MessagePartRenderer key={i} part={part} streaming={streaming} allParts={message.parts} />
        ))}
        <SourcesBlock sources={sourceParts} />
        {(message.usage != null || !isOptimistic) && (
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
}
