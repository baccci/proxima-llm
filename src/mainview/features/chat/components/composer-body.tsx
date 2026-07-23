import { PROVIDER_IDS } from '@shared/providers/registry'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconArrowUp } from '@/components/icons/icon-arrow-up'
import { IconStop } from '@/components/icons/icon-stop'
import { chat } from '@/features/chat/chat.api'
import { ComposerAddMenu } from '@/features/chat/components/composer-add-menu'
import { ComposerAttachmentRow } from '@/features/chat/components/composer-attachment-row'
import { ComposerButton } from '@/features/chat/components/composer-button'
import { attachmentAccept, getCapabilities } from '@/features/chat/helpers/composer-capabilities'
import { reconcileComposer } from '@/features/chat/helpers/reconcile-composer'
import { shouldSendOnEnter } from '@/features/chat/helpers/send-key'
import { useAutoResizeTextarea } from '@/features/chat/hooks/use-auto-resize-textarea'
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
  const [currentModelId, setCurrentModelId] = React.useState<string | null>(null)
  const modelId = currentModelId ?? defaultModelId
  const selectedModel = allModels.find((m) => m.id === modelId)
  const { canThink, canVision, canPdf, canBrowse } = getCapabilities(selectedModel)
  const canSubmit = (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!modelId

  const accept = attachmentAccept({ canVision, canPdf })

  function handleModelChange(id: string) {
    setCurrentModelId(id)
    const model = allModels.find((m) => m.id === id)
    if (!model) {
      return
    }

    const patch = reconcileComposer(model, {
      thinking: thinkingEnabled,
      webSearch: browserEnabled,
      effort: effortValue,
    })
    if (patch.thinking === false) {
      setThinkingEnabled(false)
    }
    if (patch.webSearch === false) {
      setBrowserEnabled(false)
    }
    if (patch.effort === null) {
      setEffortValue(null)
    }
  }

  async function handleSubmit() {
    const content = text.trim()
    if ((!content && pending.length === 0) || !modelId || isStreaming) return

    setText('')
    resetTextarea()
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

      await sendTurn({
        chatId: created.id,
        content,
        modelId,
        thinking: thinkingEnabled && canThink,
        webSearch: browserEnabled && canBrowse,
        effort: effortValue,
        pending,
        flush,
        clear,
        send,
      })
    } catch (err) {
      const message = errorMessage(err, 'Something went wrong')
      if (createdId) {
        failStreaming(message)
      } else {
        setText(content)
      }
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
      addFiles(e.target.files, selectedModel)
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
