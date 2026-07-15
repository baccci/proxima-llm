import { effortLevelsForModel } from '@shared/models/effort'
import { COMPACT_NOOP_REASON, COMPACT_STATUS, type CompactResult } from '@shared/rpc/compact-result'
import type { ChatDTO } from '@shared/schemas/chat.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'
import React from 'react'
import { IconArrowUp } from '@/components/icons/icon-arrow-up'
import { IconStop } from '@/components/icons/icon-stop'
import { TooltipWrapper } from '@/components/tooltip'
import { UsageRing } from '@/components/usage-ring'
import {
  supportsPdf,
  supportsThinking,
  supportsVision,
  supportsWebSearch,
} from '@/entities/model/capabilities'
import { chat } from '@/features/chat/chat.api'
import { AttachmentChip } from '@/features/chat/components/attachment-chip'
import { ComposerAddMenu } from '@/features/chat/components/composer-add-menu'
import { usePendingAttachments } from '@/features/chat/hooks/use-pending-attachments'
import { useStreamingMessage } from '@/features/chat/hooks/use-streaming-message'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useModels } from '@/features/models/hooks/use-models'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { cn } from '@/utils/tailwind-class-merge'
import { ModelSwitcher } from './model-switcher'

// Max height (px) the composer grows to before it starts scrolling.
const COMPOSER_MAX_H = 272
// How long the post-compaction note stays on screen.
const COMPACT_NOTE_TIMEOUT_MS = 4000
// Show the compact button once context usage passes this fraction.
const COMPACT_HINT_THRESHOLD = 0.6
// File-picker accept lists, gated by what the model can read.
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const PDF_ACCEPT = 'application/pdf'

// Turn a compaction result into the note we show the user.
function compactionNote(result: CompactResult): string {
  if (result.status === COMPACT_STATUS.ok) {
    const n = result.summarized
    return `Summarized ${n} earlier message${n === 1 ? '' : 's'} to save context`
  }

  const noopMessages: Record<string, string> = {
    [COMPACT_NOOP_REASON.nothingToSummarize]: 'Already compact — nothing older to summarize',
    [COMPACT_NOOP_REASON.noTitleModel]: 'No model available to summarize',
  }
  return noopMessages[result.reason] ?? 'Compaction produced no summary'
}

// Human-readable message from a caught error, or a fallback when it is not an Error.
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

type StopButtonProps = { onClick: () => void }

function StopButton({ onClick }: StopButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition cursor-pointer pointer-fine:active:transform-[scale(0.97)]"
    >
      <IconStop width={12} />
    </button>
  )
}

type SendButtonProps = { onClick: () => void; disabled: boolean }

function SendButton({ onClick, disabled }: SendButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition duration-150 cursor-pointer disabled:opacity-0 disabled:pointer-events-none pointer-fine:active:transform-[scale(0.97)]"
    >
      <IconArrowUp width={16} />
    </button>
  )
}

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
  const [isCompacting, setIsCompacting] = React.useState(false)
  const [compactNote, setCompactNote] = React.useState<string | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const chatId = chatItem.id
  const currentModelId = chatItem.modelId
  const thinkingEnabled = chatItem.composer.thinking
  const browserEnabled = chatItem.composer.webSearch
  const effortValue = chatItem.composer.effort
  const { data: settings } = useSettings()
  const { data: allModels = [] } = useModels()
  const failStreaming = useChatStore((s) => s.failStreaming)
  const finishStreaming = useChatStore((s) => s.finishStreaming)
  const setCompactingChatId = useChatStore((s) => s.setCompactingChatId)
  const { streaming, send } = useStreamingMessage(chatId)
  const { pending, attachError, addFiles, removeAttachment, flush, clear } = usePendingAttachments()

  const selectedModel: ModelDTO | undefined = allModels.find((m) => m.id === currentModelId)

  // What the selected model can do drives which composer controls are enabled.
  const canThink = selectedModel ? supportsThinking(selectedModel) : false
  const canVision = selectedModel ? supportsVision(selectedModel) : false
  const canPdf = selectedModel ? supportsPdf(selectedModel) : false
  const canBrowse = selectedModel ? supportsWebSearch(selectedModel) : false

  const isStreaming = !!streaming && !streaming.done
  const canSubmit =
    (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!currentModelId

  const accept = [...(canVision ? [IMAGE_ACCEPT] : []), ...(canPdf ? [PDF_ACCEPT] : [])].join(',')

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_H)}px`
  }

  async function handleCompactClick() {
    if (isCompacting || isStreaming) {
      return
    }

    setIsCompacting(true)
    setCompactNote(null)
    setCompactingChatId(chatId)

    const showNote = (msg: string) => {
      setCompactNote(msg)
      window.setTimeout(() => setCompactNote(null), COMPACT_NOTE_TIMEOUT_MS)
    }

    try {
      const result = await chat.compactNow(chatId)
      showNote(compactionNote(result))
    } catch (err) {
      showNote(errorMessage(err, 'Compaction failed'))
    } finally {
      setIsCompacting(false)
      setCompactingChatId(null)
    }
  }

  async function handleSubmit() {
    if (!canSubmit) {
      return
    }

    const content = text.trim()
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const attachmentIds = await flush(chatId)
      clear()

      chat.addOptimisticUserMessage(
        chatId,
        content,
        pending.map((att, i) => ({
          id: attachmentIds[i],
          kind: att.kind,
          mediaType: att.mediaType,
        })),
      )

      const { streamId, assistantMessageId } = await chat.sendMessage({
        chatId,
        modelId: currentModelId,
        content,
        thinking: thinkingEnabled && canThink,
        webSearch: browserEnabled && canBrowse,
        effort: effortValue,
        attachmentIds,
      })

      chat.invalidateMessages(chatId)
      chat.invalidateList()
      await send(streamId, assistantMessageId)
    } catch (err) {
      failStreaming(errorMessage(err, 'Something went wrong'))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') {
      return
    }

    // Enter sends the message. When send-on-enter is off, only Cmd/Ctrl+Enter sends.
    const sendOnEnter = settings?.sendOnEnter ?? true
    const shouldSend = sendOnEnter ? !e.shiftKey : e.metaKey || e.ctrlKey
    if (!shouldSend) {
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

  function handleModelChange(id: string) {
    const model = allModels.find((m) => m.id === id)

    // Unknown model id: switch without reconciling composer flags.
    if (!model) {
      chat.update({ id: chatId, modelId: id })
      return
    }

    // Turn off any composer option the new model can't do.
    const composerPatch: { thinking?: boolean; webSearch?: boolean; effort?: string | null } = {}
    if (thinkingEnabled && !supportsThinking(model)) {
      composerPatch.thinking = false
    }
    if (browserEnabled && !supportsWebSearch(model)) {
      composerPatch.webSearch = false
    }
    // Drop the effort if the new model doesn't offer it (covers losing thinking
    // entirely and switching to a narrower level set, e.g. opus 'max' → an OR model).
    if (effortValue && !effortLevelsForModel(model).includes(effortValue)) {
      composerPatch.effort = null
    }

    const hasPatch = Object.keys(composerPatch).length > 0
    chat.update({
      id: chatId,
      modelId: id,
      ...(hasPatch ? { composer: composerPatch } : {}),
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) {
      return
    }
    addFiles(e.target.files, selectedModel)
    e.target.value = ''
  }

  return (
    <div className="shrink-0 px-6 pb-5 pt-2">
      <div className="max-w-(--layout-content-w) mx-auto rounded-2xl border border-border bg-panel shadow-input focus-within:border-border-strong transition-colors">
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pending.map((att) => (
              <AttachmentChip
                key={att.localId}
                attachment={{
                  id: att.localId,
                  chatId,
                  kind: att.kind,
                  mediaType: att.mediaType,
                  byteSize: att.byteSize,
                  sha256: '',
                  relPath: att.name,
                  createdAt: new Date().toISOString(),
                }}
                onRemove={() => removeAttachment(att.localId)}
              />
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            autoResize(e.target)
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Waiting for response…'
              : `Reply to ${selectedModel?.displayName ?? 'AI'}…`
          }
          disabled={isStreaming}
          rows={1}
          className="w-full resize-none overflow-y-auto bg-transparent px-4 pt-3 pb-2 text-base text-foreground placeholder:text-subtle outline-none disabled:opacity-50"
        />

        <div className="flex items-center gap-1 px-3 pb-2.5 pt-1">
          <ComposerAddMenu
            model={selectedModel}
            thinking={thinkingEnabled && canThink}
            webSearch={browserEnabled && canBrowse}
            effort={effortValue}
            disabled={isStreaming}
            onThinkingChange={(v) => chat.update({ id: chatId, composer: { thinking: v } })}
            onWebSearchChange={(v) => chat.update({ id: chatId, composer: { webSearch: v } })}
            onEffortChange={(v) => chat.update({ id: chatId, composer: { effort: v } })}
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
            modelId={currentModelId}
            onChange={handleModelChange}
            disabled={isStreaming}
            usedTokens={contextUsed}
            cachedFraction={contextCached}
            effort={effortValue}
          />

          {contextFraction != null && contextFraction >= COMPACT_HINT_THRESHOLD && (
            <TooltipWrapper content={isCompacting ? 'Compacting…' : contextRingTooltip} side="top">
              <button
                type="button"
                onClick={handleCompactClick}
                disabled={isCompacting || isStreaming}
                aria-label="Compact conversation to free up context"
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-lg text-accent-500 transition-colors',
                  isCompacting
                    ? 'animate-pulse cursor-default'
                    : 'hover:text-accent-400 hover:bg-surface-hover cursor-pointer',
                )}
              >
                <UsageRing fraction={contextFraction} size={16} />
              </button>
            </TooltipWrapper>
          )}

          <div className="flex-1" />

          {isStreaming ? (
            <StopButton onClick={handleStopClick} />
          ) : (
            <SendButton onClick={handleSubmit} disabled={!canSubmit} />
          )}
        </div>

        {attachError && <p className="px-4 pb-2 text-xs text-danger">{attachError}</p>}
        {compactNote && <p className="px-4 pb-2 text-xs text-subtle">{compactNote}</p>}
      </div>

      <p className="mt-1.5 text-center text-2xs text-subtle">
        {settings?.sendOnEnter
          ? 'Enter to send · Shift+Enter for newline'
          : '⌘+Enter to send · Enter for newline'}
      </p>
    </div>
  )
}
