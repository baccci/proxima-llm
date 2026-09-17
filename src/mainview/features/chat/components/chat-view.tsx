import { formatTokens } from '@utils/format-tokens'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconMaximize } from '@/components/icons/icon-maximize'
import { chatTitle } from '@/features/chat/entities/chat-title'
import { getContextUsage } from '@/features/chat/entities/context-usage'
import { useChat } from '@/features/chat/hooks/use-chats'
import { useCompaction } from '@/features/chat/hooks/use-compaction'
import { useMessages } from '@/features/chat/hooks/use-messages'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useDevtoolsStore } from '@/features/devtools/store/devtools.store'
import { groupIntoExchanges } from '@/features/focus-mode/entities/group-into-exchanges'
import { useModels } from '@/hooks/use-models'
import { useProjects } from '@/hooks/use-projects'
import { useLayoutStore } from '@/store/layout.store'
import { ChatActionsMenu } from './chat-actions-menu'
import { MessageInput } from './message-input/message-input'
import { MessageList } from './message-list'
import { WelcomeComposer } from './welcome-composer'

export function ChatView() {
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen)
  const setFocusModeOpen = useChatStore((s) => s.setFocusModeOpen)
  const setFocusModeExchangeIndex = useChatStore((s) => s.setFocusModeExchangeIndex)
  const { data: chat } = useChat(selectedChatId)
  const { data: projects = [] } = useProjects()
  const { data: messages = [] } = useMessages(selectedChatId)
  const { data: compaction } = useCompaction(selectedChatId)
  const { data: allModels = [] } = useModels()

  const project = projects.find((p) => p.id === chat?.projectId)
  const model = allModels.find((m) => m.id === chat?.modelId)

  const exchanges = React.useMemo(() => groupIntoExchanges(messages), [messages])
  // Dev-tools token faker, null in prod (the panel that sets it never mounts).
  const forcedTokens = useDevtoolsStore((s) => s.forcedTokens)
  const ctxUsage = React.useMemo(() => {
    const base = getContextUsage(messages, model)
    if (forcedTokens == null) {
      return base
    }
    // Synthesize usage when there's no real turn yet, so the faker drives the
    // ring/counter even on a chat with no assistant reply.
    const limit = model?.capabilities.contextWindow
    if (!limit) {
      return base
    }
    return {
      used: forcedTokens,
      limit,
      fraction: Math.min(1, forcedTokens / limit),
      cachedFraction: base?.cachedFraction ?? 0,
      lastTurn: base?.lastTurn ?? { inputTokens: forcedTokens, outputTokens: 0 },
    }
  }, [messages, model, forcedTokens])

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
    <main className="relative isolate flex flex-col flex-1 min-w-0 h-full overflow-hidden">
      {/* Header, an absolute overlay so messages scroll under it and fade out.
          pointer-events-none lets clicks pass through the transparent lower
          edge to the messages beneath; the interactive clusters re-enable them.
          Dragging is handled by the full-width fixed handle in app.tsx. */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 flex items-center gap-2 pt-2 pb-4 pointer-events-none electrobun-webkit-app-region-drag bg-linear-to-b from-background via-background via-60% to-transparent',
          sidebarOpen ? 'px-6' : 'pl-(--layout-header-inset) pr-6',
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 pointer-events-auto ">
          {project && (
            <>
              <span className="text-subtle text-sm truncate max-w-[120px]">{project.name}</span>
              <span className="text-subtle text-sm">/</span>
            </>
          )}
          <span className="text-sm font-semibold text-foreground truncate">{chatTitle(chat)}</span>
        </div>
        <div className="flex-1" />
        {/* relative z-sticky raises this above the full-width fixed drag overlay in app.tsx (h-14),
            which otherwise intercepts the click, same pattern as the sidebar-toggle button. */}
        <div className="relative z-10 pointer-events-auto electrobun-webkit-app-region-no-drag flex items-center gap-1">
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
      <MessageList
        key={selectedChatId}
        messages={messages}
        chatItem={chat}
        compactedThroughAt={compaction?.displayThroughAt}
      />

      {/* Input */}
      <MessageInput
        chatItem={chat}
        contextUsed={ctxUsage?.used}
        contextCached={ctxUsage?.cachedFraction}
        contextFraction={ctxUsage?.fraction}
        contextRingTooltip={ringTooltip}
      />
    </main>
  )
}
