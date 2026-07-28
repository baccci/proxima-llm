import { PROVIDER_IDS } from '@shared/providers/registry'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconArrowUp } from '@/components/icons/icon-arrow-up'
import { IconStop } from '@/components/icons/icon-stop'
import { chat } from '@/features/chat/chat.api'
import { ComposerAddMenu } from '@/features/chat/components/composer-add-menu'
import { ComposerAttachmentRow } from '@/features/chat/components/composer-attachment-row'
import { ComposerButton } from '@/features/chat/components/composer-button'
import { attachmentAccept } from '@/features/chat/helpers/composer-capabilities'
import type { ComposerFlags, ComposerPatch } from '@/features/chat/helpers/composer-reasoning'
import { shouldSendOnEnter } from '@/features/chat/helpers/send-key'
import { useAutoResizeTextarea } from '@/features/chat/hooks/use-auto-resize-textarea'
import { useComposerControls } from '@/features/chat/hooks/use-composer-controls'
import { usePendingAttachments } from '@/features/chat/hooks/use-pending-attachments'
import { useStreamingMessage } from '@/features/chat/hooks/use-streaming-message'
import { sendTurn } from '@/features/chat/lib/send-turn'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useModels } from '@/features/models/hooks/use-models'
import { useApiKeyStatuses, useSettings } from '@/features/settings/hooks/use-settings'
import { errorMessage } from '@/utils/error-message'
import { ModelSwitcher } from './model-switcher'

type ComposerBodyProps = {
  projectId: string | null
  className?: string
}

export function ComposerBody({ projectId, className }: ComposerBodyProps) {
  const [text, setText] = React.useState('')
  const [thinkingEnabled, setThinkingEnabled] = React.useState(false)
  const [browserEnabled, setBrowserEnabled] = React.useState(false)
  const [effortValue, setEffortValue] = React.useState<string | null>(null)
  const [currentModelId, setCurrentModelId] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { ref: textareaRef, autoResize, reset: resetTextarea } = useAutoResizeTextarea()

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
  const defaultModelId =
    settings?.defaultModelId ??
    allModels.find((m) => m.isEnabled && configuredProviders.has(m.provider))?.id ??
    allModels.find((m) => m.isEnabled)?.id ??
    null
  const modelId = currentModelId ?? defaultModelId

  const flags: ComposerFlags = {
    thinking: thinkingEnabled,
    webSearch: browserEnabled,
    effort: effortValue,
  }

  function applyFlags(patch: ComposerPatch) {
    if (patch.thinking !== undefined) {
      setThinkingEnabled(patch.thinking)
    }
    if (patch.webSearch !== undefined) {
      setBrowserEnabled(patch.webSearch)
    }
    if (patch.effort !== undefined) {
      setEffortValue(patch.effort)
    }
  }

  const controls = useComposerControls({
    models: allModels,
    modelId,
    flags,
    applyFlags,
    changeModel: (id, patch) => {
      setCurrentModelId(id)
      applyFlags(patch)
    },
  })
  const { model, canVision, canPdf, canBrowse, thinkingActive, effortActive } = controls

  const webSearchActive = browserEnabled && canBrowse
  const canSubmit = (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!modelId

  const accept = attachmentAccept({ canVision, canPdf })

  async function handleSubmit() {
    const content = text.trim()
    if (!canSubmit) {
      return
    }

    setText('')
    resetTextarea()
    let createdId: string | null = null

    try {
      const created = await chat.create({
        modelId,
        projectId: projectId ?? undefined,
        composer: {
          thinking: thinkingActive,
          webSearch: webSearchActive,
          effort: effortActive,
          toolGrants: {},
        },
      })
      createdId = created.id
      selectChat(created.id)

      await sendTurn({
        chatId: created.id,
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
      const message = errorMessage(err, 'Something went wrong')
      if (createdId) {
        failStreaming(message)
        return
      }
      setText(content)
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
    if (e.target.files) {
      addFiles(e.target.files, model)
      e.target.value = ''
    }
  }

  return (
    <div className={cn(className, 'w-full flex flex-col gap-2')}>
      <div className="w-full rounded-2xl border border-border bg-panel focus-within:border-border-strong transition-colors">
        <ComposerAttachmentRow pending={pending} chatId="" onRemove={removeAttachment} />

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          disabled={isStreaming}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-base text-foreground placeholder:text-subtle outline-none disabled:opacity-50"
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
            effort={effortActive}
          />

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
      </div>

      <p className="text-center text-2xs text-subtle">
        {settings?.sendOnEnter
          ? 'Enter to send · Shift+Enter for newline'
          : '⌘+Enter to send · Enter for newline'}
      </p>
    </div>
  )
}
