import { effortLevelsForModel } from '@shared/models/effort'
import { COMPACT_NOOP_REASON, COMPACT_STATUS } from '@shared/rpc/compact-result'
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

interface Props {
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
}: Props) {
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
  const canThink = selectedModel ? supportsThinking(selectedModel) : false
  const canVision = selectedModel ? supportsVision(selectedModel) : false
  const canPdf = selectedModel ? supportsPdf(selectedModel) : false
  const canBrowse = selectedModel ? supportsWebSearch(selectedModel) : false
  const isStreaming = !!streaming && !streaming.done
  const canSubmit =
    (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!currentModelId

  const accept = [
    ...(canVision ? ['image/png,image/jpeg,image/webp,image/gif'] : []),
    ...(canPdf ? ['application/pdf'] : []),
  ].join(',')

  const COMPOSER_MAX_H = 272

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_H)}px`
  }

  async function handleCompactClick() {
    if (isCompacting || isStreaming) return
    setIsCompacting(true)
    setCompactNote(null)
    setCompactingChatId(chatId)
    const showNote = (msg: string) => {
      setCompactNote(msg)
      window.setTimeout(() => setCompactNote(null), 4000)
    }
    try {
      const result = await chat.compactNow(chatId)
      if (result.status === COMPACT_STATUS.ok) {
        const n = result.summarized
        showNote(`Summarized ${n} earlier message${n === 1 ? '' : 's'} to save context`)
      } else {
        showNote(
          result.reason === COMPACT_NOOP_REASON.nothingToSummarize
            ? 'Already compact — nothing older to summarize'
            : result.reason === COMPACT_NOOP_REASON.noTitleModel
              ? 'No model available to summarize'
              : 'Compaction produced no summary',
        )
      }
    } catch (err) {
      showNote(err instanceof Error ? err.message : 'Compaction failed')
    } finally {
      setIsCompacting(false)
      setCompactingChatId(null)
    }
  }

  async function handleSubmit() {
    const content = text.trim()
    if ((!content && pending.length === 0) || !currentModelId || isStreaming) return

    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

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
      const message = err instanceof Error ? err.message : 'Something went wrong'
      failStreaming(message)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const sendOnEnter = settings?.sendOnEnter ?? true
    if (e.key === 'Enter') {
      if (sendOnEnter && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      } else if (!sendOnEnter && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleSubmit()
      }
    }
  }

  function handleModelChange(id: string) {
    const m = allModels.find((model) => model.id === id)
    const composerPatch: { thinking?: boolean; webSearch?: boolean; effort?: string | null } = {}
    if (thinkingEnabled && m && !supportsThinking(m)) composerPatch.thinking = false
    if (browserEnabled && m && !supportsWebSearch(m)) composerPatch.webSearch = false
    // Drop the effort if the new model doesn't offer it (covers losing thinking
    // entirely and switching to a narrower level set, e.g. opus 'max' → an OR model).
    if (effortValue && m && !effortLevelsForModel(m).includes(effortValue))
      composerPatch.effort = null
    chat.update({
      id: chatId,
      modelId: id,
      ...(Object.keys(composerPatch).length > 0 ? { composer: composerPatch } : {}),
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files, selectedModel)
      e.target.value = ''
    }
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

          {contextFraction != null && contextFraction >= 0.6 && (
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
            <button
              onClick={() => {
                if (streaming) chat.cancelStream(streaming.streamId)
                finishStreaming()
              }}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition cursor-pointer pointer-fine:active:transform-[scale(0.97)]"
            >
              <IconStop width={12} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition duration-150 cursor-pointer disabled:opacity-0 disabled:pointer-events-none pointer-fine:active:transform-[scale(0.97)]',
              )}
            >
              <IconArrowUp width={16} />
            </button>
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
