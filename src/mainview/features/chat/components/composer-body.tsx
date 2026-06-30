import { effortLevelsForModel } from '@shared/models/effort'
import { PROVIDER_IDS } from '@shared/providers/registry'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconArrowUp } from '@/components/icons/icon-arrow-up'
import { IconStop } from '@/components/icons/icon-stop'
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
import { useApiKeyStatuses, useSettings } from '@/features/settings/hooks/use-settings'
import { ModelSwitcher } from './model-switcher'

interface ComposerBodyProps {
  projectId: string | null
  className?: string
}

export function ComposerBody({ projectId, className }: ComposerBodyProps) {
  const [text, setText] = React.useState('')
  const [thinkingEnabled, setThinkingEnabled] = React.useState(false)
  const [browserEnabled, setBrowserEnabled] = React.useState(false)
  const [effortValue, setEffortValue] = React.useState<string | null>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const { data: settings } = useSettings()
  const { data: allModels = [] } = useModels()
  const keyStatuses = useApiKeyStatuses()
  const selectChat = useChatStore((s) => s.selectChat)
  const failStreaming = useChatStore((s) => s.failStreaming)
  const finishStreaming = useChatStore((s) => s.finishStreaming)
  const { streaming, send } = useStreamingMessage(null)
  const { pending, attachError, addFiles, removeAttachment, flush, clear } = usePendingAttachments()

  const isStreaming = !!streaming && !streaming.done

  const configuredProviders = new Set<string>(PROVIDER_IDS.filter((id) => keyStatuses[id]))
  const settingsDefault =
    settings?.defaultModelId ??
    allModels.find((m) => m.isEnabled && configuredProviders.has(m.provider))?.id ??
    allModels.find((m) => m.isEnabled)?.id ??
    null
  const defaultModelId = settingsDefault
  const [currentModelId, setCurrentModelId] = React.useState<string | null>(null)
  const modelId = currentModelId ?? defaultModelId
  const selectedModel = allModels.find((m) => m.id === modelId)
  const canThink = selectedModel ? supportsThinking(selectedModel) : false
  const canBrowse = selectedModel ? supportsWebSearch(selectedModel) : false
  const canVision = selectedModel ? supportsVision(selectedModel) : false
  const canPdf = selectedModel ? supportsPdf(selectedModel) : false
  const canSubmit = (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!modelId

  const accept = [
    ...(canVision ? ['image/png,image/jpeg,image/webp,image/gif'] : []),
    ...(canPdf ? ['application/pdf'] : []),
  ].join(',')

  function handleModelChange(id: string) {
    setCurrentModelId(id)
    const m = allModels.find((m) => m.id === id)
    if (thinkingEnabled && m && !supportsThinking(m)) setThinkingEnabled(false)
    if (browserEnabled && m && !supportsWebSearch(m)) setBrowserEnabled(false)
    // Drop the effort if the new model doesn't offer it (covers losing thinking
    // entirely and switching to a narrower level set, e.g. opus 'max' → an OR model).
    if (effortValue && m && !effortLevelsForModel(m).includes(effortValue)) setEffortValue(null)
  }

  async function handleSubmit() {
    const content = text.trim()
    if ((!content && pending.length === 0) || !modelId || isStreaming) return

    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    let createdId: string | null = null

    try {
      const created = await chat.create({
        modelId,
        projectId: projectId ?? undefined,
        composer: {
          thinking: thinkingEnabled && canThink,
          webSearch: browserEnabled && canBrowse,
          effort: effortValue,
          toolGrants: {},
        },
      })
      createdId = created.id
      selectChat(created.id)

      const attachmentIds = await flush(created.id)
      clear()

      chat.addOptimisticUserMessage(
        created.id,
        content,
        pending.map((att, i) => ({
          id: attachmentIds[i],
          kind: att.kind,
          mediaType: att.mediaType,
        })),
      )

      const { streamId, assistantMessageId } = await chat.sendMessage({
        chatId: created.id,
        modelId,
        content,
        thinking: thinkingEnabled && canThink,
        webSearch: browserEnabled && canBrowse,
        effort: effortValue,
        attachmentIds,
      })

      chat.invalidateMessages(created.id)
      await send(streamId, assistantMessageId)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      if (createdId) {
        failStreaming(message)
      } else {
        setText(content)
      }
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files, selectedModel)
      e.target.value = ''
    }
  }

  return (
    <div className={cn(className, 'w-full flex flex-col gap-2')}>
      <div className="w-full rounded-2xl border border-border bg-panel focus-within:border-border-strong transition-colors">
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pending.map((att) => (
              <AttachmentChip
                key={att.localId}
                attachment={{
                  id: att.localId,
                  chatId: '',
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
          placeholder="Message…"
          disabled={isStreaming}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base text-foreground placeholder:text-subtle outline-none disabled:opacity-50"
        />

        <div className="flex items-center gap-1 px-3 pb-2.5 pt-1">
          <ComposerAddMenu
            model={selectedModel}
            thinking={thinkingEnabled && canThink}
            webSearch={browserEnabled && canBrowse}
            effort={effortValue}
            disabled={isStreaming}
            onThinkingChange={setThinkingEnabled}
            onWebSearchChange={setBrowserEnabled}
            onEffortChange={setEffortValue}
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
            onChange={handleModelChange}
            disabled={isStreaming}
            effort={effortValue}
          />

          <div className="flex-1" />

          {isStreaming ? (
            <button
              onClick={() => {
                if (streaming) chat.cancelStream(streaming.streamId)
                finishStreaming()
              }}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition-colors cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <IconStop width={12} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition duration-150 cursor-pointer',
                'disabled:opacity-0 disabled:pointer-events-none',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <IconArrowUp width={16} />
            </button>
          )}
        </div>

        {attachError && <p className="px-4 pb-2 text-xs text-danger">{attachError}</p>}
      </div>

      <p className="text-center text-2xs text-subtle">
        {settings?.sendOnEnter
          ? 'Enter to send · Shift+Enter for newline'
          : '⌘+Enter to send · Enter for newline'}
      </p>
    </div>
  )
}
