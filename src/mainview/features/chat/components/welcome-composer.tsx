import { cn } from '@utils/tailwind-class-merge'
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
import { useApiKeyStatus, useSettings } from '@/features/settings/hooks/use-settings'
import { composerToggleClass } from '../lib/composer-toggle'
import { ModelSwitcher } from './model-switcher'

const GREETINGS = [
  "What's on your mind?",
  "Let's think together.",
  'Ask me anything.',
  'How can I help today?',
  'What are we building?',
  'Ready when you are.',
]

function pickGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
}

export function WelcomeComposer() {
  const [text, setText] = React.useState('')
  const [thinkingEnabled, setThinkingEnabled] = React.useState(false)
  const [browserEnabled, setBrowserEnabled] = React.useState(false)
  const [greeting] = React.useState(pickGreeting)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const { data: settings } = useSettings()
  const { data: allModels = [] } = useModels()
  const { data: anthropicKey } = useApiKeyStatus('anthropic')
  const { data: openrouterKey } = useApiKeyStatus('openrouter')
  const selectChat = useChatStore((s) => s.selectChat)
  const failStreaming = useChatStore((s) => s.failStreaming)
  const finishStreaming = useChatStore((s) => s.finishStreaming)
  const { streaming, send } = useStreamingMessage(null)
  const { pending, attachError, addFiles, removeAttachment, flush, clear } = usePendingAttachments()

  const isStreaming = !!streaming && !streaming.done

  const configuredProviders = new Set([
    ...(anthropicKey?.configured ? ['anthropic'] : []),
    ...(openrouterKey?.configured ? ['openrouter'] : []),
  ])
  const defaultModelId =
    settings?.defaultModelId ??
    allModels.find((m) => m.isEnabled && configuredProviders.has(m.provider))?.id ??
    allModels.find((m) => m.isEnabled)?.id ??
    null
  const [currentModelId, setCurrentModelId] = React.useState<string | null>(null)
  const modelId = currentModelId ?? defaultModelId
  const selectedModel = allModels.find((m) => m.id === modelId)
  const canThink = selectedModel ? supportsThinking(selectedModel) : false
  const canBrowse = selectedModel ? supportsWebSearch(selectedModel) : false
  const canVision = selectedModel ? supportsVision(selectedModel) : false
  const canPdf = selectedModel ? supportsPdf(selectedModel) : false
  const canAttach = canVision || canPdf
  const canSubmit = (text.trim().length > 0 || pending.length > 0) && !isStreaming && !!modelId

  const accept = [
    ...(canVision ? ['image/png,image/jpeg,image/webp,image/gif'] : []),
    ...(canPdf ? ['application/pdf'] : []),
  ].join(',')

  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  function handleModelChange(id: string) {
    setCurrentModelId(id)
    const m = allModels.find((m) => m.id === id)
    if (thinkingEnabled && m && !supportsThinking(m)) setThinkingEnabled(false)
    if (browserEnabled && m && !supportsWebSearch(m)) setBrowserEnabled(false)
  }

  async function handleSubmit() {
    const content = text.trim()
    if ((!content && pending.length === 0) || !modelId || isStreaming) return

    setText('')
    let createdId: string | null = null

    try {
      const created = await chat.create({
        modelId,
        composer: {
          thinking: thinkingEnabled && canThink,
          webSearch: browserEnabled && canBrowse,
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
    <main className="flex flex-col flex-1 h-full overflow-hidden items-center justify-center z-base">
      <div className="w-full max-w-[640px] px-6 flex flex-col items-center gap-5">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">{greeting}</h1>

        <div className="w-full rounded-xl border border-border bg-panel focus-within:border-border-strong transition-colors">
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
                className={cn(
                  'flex items-center justify-center h-8 w-8 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none',
                  'text-subtle hover:bg-surface-hover hover:text-foreground',
                )}
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

            <ModelSwitcher modelId={modelId} onChange={handleModelChange} disabled={isStreaming} />

            {canThink && (
              <TooltipWrapper
                content={thinkingEnabled ? 'Disable thinking' : 'Enable thinking'}
                side="top"
              >
                <button
                  onClick={() => setThinkingEnabled((v) => !v)}
                  disabled={isStreaming}
                  className={composerToggleClass(thinkingEnabled)}
                >
                  <IconBrain width={14} />
                </button>
              </TooltipWrapper>
            )}

            {canBrowse && (
              <TooltipWrapper
                content={browserEnabled ? 'Disable web search' : 'Enable web search'}
                side="top"
              >
                <button
                  onClick={() => setBrowserEnabled((v) => !v)}
                  disabled={isStreaming}
                  className={composerToggleClass(browserEnabled)}
                >
                  <IconGlobe width={14} />
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
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-brand text-brand-foreground hover:bg-brand-hover transition-colors cursor-pointer"
              >
                <IconStop width={12} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-brand text-brand-foreground hover:bg-brand-hover transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
              >
                <IconArrowUp width={16} />
              </button>
            )}
          </div>

          {attachError && <p className="px-4 pb-2 text-xs text-red-400">{attachError}</p>}
        </div>

        <p className="text-2xs text-subtle">
          {settings?.sendOnEnter
            ? 'Enter to send · Shift+Enter for newline'
            : '⌘+Enter to send · Enter for newline'}
        </p>
      </div>
    </main>
  )
}
