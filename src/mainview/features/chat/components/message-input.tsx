import type { ChatDTO } from '@shared/schemas/chat.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'
import React from 'react'
import { IconArrowUp } from '@/components/icons/icon-arrow-up'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconPaperclip } from '@/components/icons/icon-paperclip'
import { IconStop } from '@/components/icons/icon-stop'
import { TooltipWrapper } from '@/components/tooltip'
import {
  supportsPdf,
  supportsThinking,
  supportsVision,
  supportsWebSearch,
} from '@/entities/model/capabilities'
import { chat } from '@/features/chat/chat.api'
import { AttachmentChip } from '@/features/chat/components/attachment-chip'
import { usePendingAttachments } from '@/features/chat/hooks/use-pending-attachments'
import { useStreamingMessage } from '@/features/chat/hooks/use-streaming-message'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useModels } from '@/features/models/hooks/use-models'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { composerToggleClass } from '../lib/composer-toggle'
import { ModelSwitcher } from './model-switcher'

interface Props {
  chatItem: ChatDTO
  contextUsed?: number
  contextCached?: number
}

export function MessageInput({ chatItem, contextUsed, contextCached }: Props) {
  const [text, setText] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const chatId = chatItem.id
  const currentModelId = chatItem.modelId
  const thinkingEnabled = chatItem.composer.thinking
  const browserEnabled = chatItem.composer.webSearch
  const { data: settings } = useSettings()
  const { data: allModels = [] } = useModels()
  const failStreaming = useChatStore((s) => s.failStreaming)
  const finishStreaming = useChatStore((s) => s.finishStreaming)
  const { streaming, send } = useStreamingMessage(chatId)
  const { pending, attachError, addFiles, removeAttachment, flush, clear } = usePendingAttachments()

  const selectedModel: ModelDTO | undefined = allModels.find((m) => m.id === currentModelId)
  const canThink = selectedModel ? supportsThinking(selectedModel) : false
  const canVision = selectedModel ? supportsVision(selectedModel) : false
  const canPdf = selectedModel ? supportsPdf(selectedModel) : false
  const canAttach = canVision || canPdf
  const canBrowse = selectedModel ? supportsWebSearch(selectedModel) : false
  const isStreaming = !!streaming && !streaming.done
  const canSubmit =
    (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!currentModelId

  const accept = [
    ...(canVision ? ['image/png,image/jpeg,image/webp,image/gif'] : []),
    ...(canPdf ? ['application/pdf'] : []),
  ].join(',')

  // Auto-resize textarea
  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  async function handleSubmit() {
    const content = text.trim()
    if ((!content && pending.length === 0) || !currentModelId || isStreaming) return

    setText('')

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
    const composerPatch: { thinking?: boolean; webSearch?: boolean } = {}
    if (thinkingEnabled && m && !supportsThinking(m)) composerPatch.thinking = false
    if (browserEnabled && m && !supportsWebSearch(m)) composerPatch.webSearch = false
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
      <div className="max-w-[740px] mx-auto rounded-xl border border-border bg-panel shadow-input focus-within:border-border-strong transition-colors">
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? 'Waiting for response…'
              : `Reply to ${selectedModel?.displayName ?? 'AI'}…`
          }
          disabled={isStreaming}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base text-white placeholder:text-white/35 outline-none disabled:opacity-50"
        />

        <div className="flex items-center gap-1 px-3 pb-2.5 pt-1">
          {/* Attachment */}
          <TooltipWrapper
            content={
              canAttach ? 'Attach image or PDF' : "Current model doesn't support attachments"
            }
            side="top"
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!canAttach || isStreaming}
              className="flex items-center justify-center h-8 w-8 rounded-lg bg-white/8 text-white/70 hover:bg-white/14 hover:text-white transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
            >
              <IconPaperclip width={15} />
            </button>
          </TooltipWrapper>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={accept}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Model switcher */}
          <ModelSwitcher
            modelId={currentModelId}
            onChange={handleModelChange}
            disabled={isStreaming}
            usedTokens={contextUsed}
            cachedFraction={contextCached}
          />

          {/* Thinking toggle */}
          {canThink && (
            <TooltipWrapper
              content={thinkingEnabled ? 'Disable thinking' : 'Enable thinking'}
              side="top"
            >
              <button
                onClick={() =>
                  chat.update({ id: chatId, composer: { thinking: !thinkingEnabled } })
                }
                disabled={isStreaming}
                className={composerToggleClass(thinkingEnabled)}
              >
                <IconBrain width={14} />
              </button>
            </TooltipWrapper>
          )}

          {/* Browser toggle */}
          {canBrowse && (
            <TooltipWrapper
              content={browserEnabled ? 'Disable web search' : 'Enable web search'}
              side="top"
            >
              <button
                onClick={() =>
                  chat.update({ id: chatId, composer: { webSearch: !browserEnabled } })
                }
                disabled={isStreaming}
                className={composerToggleClass(browserEnabled)}
              >
                <IconGlobe width={14} />
              </button>
            </TooltipWrapper>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Send / Stop */}
          {isStreaming ? (
            <button
              onClick={() => {
                if (streaming) chat.cancelStream(streaming.streamId)
                finishStreaming()
              }}
              className="flex items-center justify-center h-8 w-8 rounded-lg bg-white text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <IconStop width={12} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center justify-center h-8 w-8 rounded-lg bg-white text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
            >
              <IconArrowUp width={16} />
            </button>
          )}
        </div>

        {attachError && <p className="px-4 pb-2 text-xs text-red-400">{attachError}</p>}
      </div>

      <p className="mt-1.5 text-center text-2xs text-subtle">
        {settings?.sendOnEnter
          ? 'Enter to send · Shift+Enter for newline'
          : '⌘+Enter to send · Enter for newline'}
      </p>
    </div>
  )
}
