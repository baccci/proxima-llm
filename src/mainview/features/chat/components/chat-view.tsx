import { formatTokens } from '@utils/format-tokens'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconMaximize } from '@/components/icons/icon-maximize'
import { TooltipWrapper } from '@/components/tooltip'
import { UsageRing } from '@/components/usage-ring'
import { getContextUsage } from '@/features/chat/entities/context-usage'
import { useChats } from '@/features/chat/hooks/use-chats'
import { useMessages } from '@/features/chat/hooks/use-messages'
import { useChatStore } from '@/features/chat/store/chat.store'
import { groupIntoExchanges } from '@/features/focus-mode/entities/group-into-exchanges'
import { useModels } from '@/features/models/hooks/use-models'
import { useProjects } from '@/features/projects/hooks/use-projects'
import { ChatActionsMenu } from './chat-actions-menu'
import { MessageInput } from './message-input'
import { MessageList } from './message-list'
import { WelcomeComposer } from './welcome-composer'

export function ChatView() {
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const setFocusModeOpen = useChatStore((s) => s.setFocusModeOpen)
  const setFocusModeExchangeIndex = useChatStore((s) => s.setFocusModeExchangeIndex)
  const { data: allChats = [] } = useChats(null)
  const { data: projects = [] } = useProjects()
  const { data: messages = [] } = useMessages(selectedChatId)
  const { data: allModels = [] } = useModels()

  const chat = allChats.find((c) => c.id === selectedChatId)
  const project = projects.find((p) => p.id === chat?.projectId)
  const model = allModels.find((m) => m.id === chat?.modelId)

  const exchanges = React.useMemo(() => groupIntoExchanges(messages), [messages])
  const ctxUsage = React.useMemo(() => getContextUsage(messages, model), [messages, model])

  const handleEnterFocusMode = React.useCallback(() => {
    setFocusModeExchangeIndex(Math.max(0, exchanges.length - 1))
    setFocusModeOpen(true)
  }, [exchanges.length, setFocusModeExchangeIndex, setFocusModeOpen])

  if (!selectedChatId || !chat) {
    return <WelcomeComposer />
  }

  const ringTooltip = ctxUsage && model && (
    <div className="space-y-2 min-w-[210px]">
      <p className="font-medium">
        {model.displayName} — {formatTokens(ctxUsage.limit)} token window
      </p>
      <p className="text-subtle">
        {formatTokens(ctxUsage.used)} used · {formatTokens(ctxUsage.limit - ctxUsage.used)}{' '}
        remaining · {Math.round(ctxUsage.fraction * 100)}%
      </p>
      <div className="border-t border-border pt-2">
        <p className="font-medium mb-1">Last turn</p>
        <p className="text-subtle">Input: {formatTokens(ctxUsage.lastTurn.inputTokens)}</p>
        {(ctxUsage.lastTurn.cacheReadTokens ?? 0) > 0 && (
          <p className="text-subtle">
            Cache read: {formatTokens(ctxUsage.lastTurn.cacheReadTokens!)}
          </p>
        )}
        {(ctxUsage.lastTurn.cacheWriteTokens ?? 0) > 0 && (
          <p className="text-subtle">
            Cache write: {formatTokens(ctxUsage.lastTurn.cacheWriteTokens!)}
          </p>
        )}
        <p className="text-subtle">Output: {formatTokens(ctxUsage.lastTurn.outputTokens)}</p>
      </div>
    </div>
  )

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden z-base">
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 h-[50px] shrink-0 electrobun-webkit-app-region-drag',
          sidebarOpen ? 'px-6' : 'pl-[276px] pr-6',
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 electrobun-webkit-app-region-no-drag">
          {project && (
            <>
              <span className="text-subtle text-sm truncate max-w-[120px]">{project.name}</span>
              <span className="text-subtle text-sm">/</span>
            </>
          )}
          <span className="text-sm font-semibold text-foreground truncate">
            {chat.title || 'Untitled chat'}
          </span>
        </div>
        <div className="flex-1" />
        {/* relative z-sticky raises this above the full-width fixed drag overlay in app.tsx (h-14),
            which otherwise intercepts the click — same pattern as the sidebar-toggle button. */}
        <div className="relative z-sticky electrobun-webkit-app-region-no-drag flex items-center gap-1">
          {ctxUsage && ctxUsage.fraction >= 0.6 && (
            <TooltipWrapper content={ringTooltip} side="bottom">
              <button className="flex items-center justify-center h-8 w-8 rounded-lg text-subtle hover:text-foreground hover:bg-surface-hover transition-colors">
                <UsageRing fraction={ctxUsage.fraction} size={18} />
              </button>
            </TooltipWrapper>
          )}
          <button
            onClick={handleEnterFocusMode}
            className="flex items-center justify-center h-8 w-8 rounded-lg text-subtle hover:text-foreground hover:bg-surface-hover transition-colors"
            title="Focus mode"
          >
            <IconMaximize width={15} />
          </button>
          <ChatActionsMenu chatItem={chat} triggerClassName="h-8 w-8 rounded-lg" triggerSize={16} />
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} />

      {/* Input */}
      <MessageInput
        chatItem={chat}
        contextUsed={ctxUsage?.used}
        contextCached={ctxUsage?.cachedFraction}
      />
    </main>
  )
}
