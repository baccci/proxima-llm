import type { ChatDTO } from '@shared/schemas/chat.schema'
import React from 'react'
import { IconArrowUp } from '@/components/icons/icon-arrow-up'
import { IconStop } from '@/components/icons/icon-stop'
import { TooltipWrapper } from '@/components/tooltip'
import { UsageRing } from '@/components/usage-ring'
import { chat } from '@/features/chat/chat.api'
import { ComposerAddMenu } from '@/features/chat/components/composer-add-menu'
import { ComposerAttachmentRow } from '@/features/chat/components/composer-attachment-row'
import { ComposerButton } from '@/features/chat/components/composer-button'
import { attachmentAccept } from '@/features/chat/helpers/composer-capabilities'
import type { ComposerFlags } from '@/features/chat/helpers/composer-reasoning'
import { shouldSendOnEnter } from '@/features/chat/helpers/send-key'
import { useAutoResizeTextarea } from '@/features/chat/hooks/use-auto-resize-textarea'
import { useCompactNow } from '@/features/chat/hooks/use-compact-now'
import { useComposerControls } from '@/features/chat/hooks/use-composer-controls'
import { usePendingAttachments } from '@/features/chat/hooks/use-pending-attachments'
import { useStreamingMessage } from '@/features/chat/hooks/use-streaming-message'
import { sendTurn } from '@/features/chat/lib/send-turn'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { useModels } from '@/hooks/use-models'
import { errorMessage } from '@/utils/error-message'
import { cn } from '@/utils/tailwind-class-merge'
import { ModelSwitcher } from '../model-switcher'
import { COMPACT_HINT_THRESHOLD } from './constants'

type MessageInputProps = {
  chatItem: ChatDTO
  contextUsed?: number
  contextCached?: number
  contextFraction?: number
  contextRingTooltip?: React.ReactNode
}

export function MessageInput({
  chatItem,
  contextUsed,
  contextCached,
  contextFraction,
  contextRingTooltip,
}: MessageInputProps) {
  const [text, setText] = React.useState('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const chatId = chatItem.id
  // A local const (not chatItem.modelId inline) so the canSubmit null-guard narrowing
  // survives the setText/resetTextarea calls before sendTurn reads it as a plain string.
  const modelId = chatItem.modelId
  const { data: settings } = useSettings()
  const { data: allModels = [] } = useModels()
  const failStreaming = useChatStore((s) => s.failStreaming)
  const finishStreaming = useChatStore((s) => s.finishStreaming)
  const { streaming, send } = useStreamingMessage(chatId)
  const { pending, attachError, addFiles, removeAttachment, flush, clear } = usePendingAttachments()
  const { ref: textareaRef, autoResize, reset: resetTextarea } = useAutoResizeTextarea()
  const { isCompacting, note: compactNote, compact } = useCompactNow(chatId)

  const flags: ComposerFlags = {
    thinking: chatItem.composer.thinking,
    webSearch: chatItem.composer.webSearch,
    effort: chatItem.composer.effort,
  }
  const controls = useComposerControls({
    models: allModels,
    modelId,
    flags,
    applyFlags: (patch) => chat.update({ id: chatId, composer: patch }),
    changeModel: (id, patch) => {
      const hasPatch = Object.keys(patch).length > 0
      chat.update({ id: chatId, modelId: id, ...(hasPatch ? { composer: patch } : {}) })
    },
  })
  const { model, canVision, canPdf, canBrowse, thinkingActive, effortActive } = controls

  const webSearchActive = flags.webSearch && canBrowse
  const isStreaming = !!streaming && !streaming.done
  const canSubmit = (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!modelId

  const accept = attachmentAccept({ canVision, canPdf })

  const placeholder = isStreaming
    ? 'Waiting for response…'
    : `Reply to ${model?.displayName ?? 'AI'}…`
  const sendHint = settings?.sendOnEnter
    ? 'Enter to send · Shift+Enter for newline'
    : '⌘+Enter to send · Enter for newline'

  async function handleSubmit() {
    if (!canSubmit) {
      return
    }

    const content = text.trim()
    setText('')
    resetTextarea()

    try {
      await sendTurn({
        chatId,
        content,
        modelId,
        thinking: thinkingActive,
        webSearch: webSearchActive,
        effort: effortActive,
        pending,
        flush,
        clear,
        send,
      })
    } catch (err) {
      failStreaming(errorMessage(err, 'Something went wrong'))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSendOnEnter(e, settings?.sendOnEnter ?? true)) {
      return
    }

    e.preventDefault()
    handleSubmit()
  }

  function handleStopClick() {
    if (streaming) {
      chat.cancelStream(streaming.streamId)
    }
    finishStreaming()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) {
      return
    }
    addFiles(e.target.files, model)
    e.target.value = ''
  }

  return (
    <div className="shrink-0 px-6 pb-5 pt-2">
      <div className="max-w-(--layout-content-w) mx-auto rounded-2xl border border-border bg-panel shadow-input focus-within:border-border-strong transition-colors">
        <ComposerAttachmentRow pending={pending} chatId={chatId} onRemove={removeAttachment} />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isStreaming}
          rows={1}
          className="w-full resize-none overflow-y-auto bg-transparent px-4 pt-3 pb-2 text-base text-foreground placeholder:text-subtle outline-none disabled:opacity-50"
        />

        <div className="flex items-center gap-1 px-3 pb-2.5 pt-1">
          <ComposerAddMenu
            model={model}
            thinking={thinkingActive}
            webSearch={webSearchActive}
            effort={effortActive}
            disabled={isStreaming}
            onThinkingChange={controls.onThinkingChange}
            onWebSearchChange={controls.onWebSearchChange}
            onEffortChange={controls.onEffortChange}
            onAttachClick={() => fileInputRef.current?.click()}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={handleFileChange}
          />

          <ModelSwitcher
            modelId={modelId}
            onChange={controls.onModelChange}
            disabled={isStreaming}
            usedTokens={contextUsed}
            cachedFraction={contextCached}
            effort={effortActive}
          />

          {contextFraction != null && contextFraction >= COMPACT_HINT_THRESHOLD && (
            <TooltipWrapper content={isCompacting ? 'Compacting…' : contextRingTooltip} side="top">
              <button
                type="button"
                onClick={compact}
                disabled={isCompacting || isStreaming}
                aria-label="Compact conversation to free up context"
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-lg text-accent-500 transition-colors',
                  isCompacting && 'animate-pulse cursor-default',
                  !isCompacting && 'hover:text-accent-400 hover:bg-surface-hover cursor-pointer',
                )}
              >
                <UsageRing fraction={contextFraction} size={16} />
              </button>
            </TooltipWrapper>
          )}

          <div className="flex-1" />

          {isStreaming && (
            <ComposerButton onClick={handleStopClick}>
              <IconStop width={12} />
            </ComposerButton>
          )}
          {!isStreaming && (
            <ComposerButton
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="disabled:opacity-0 disabled:pointer-events-none"
            >
              <IconArrowUp width={16} />
            </ComposerButton>
          )}
        </div>

        {attachError && <p className="px-4 pb-2 text-xs text-danger">{attachError}</p>}
        {compactNote && <p className="px-4 pb-2 text-xs text-subtle">{compactNote}</p>}
      </div>

      <p className="mt-1.5 text-center text-2xs text-subtle">{sendHint}</p>
    </div>
  )
}
