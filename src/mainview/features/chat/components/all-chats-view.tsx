import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconChevronLeft } from '@/components/icons/icon-chevron-left'
import { ChatRow } from '@/features/chat/components/chat-row'
import { flattenChatPages } from '@/features/chat/helpers/flatten-chat-pages'
import { useChats, usePinnedChats } from '@/features/chat/hooks/use-chats'
import { useLoadMoreOnScroll } from '@/features/chat/hooks/use-load-more-on-scroll'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useProjects } from '@/features/projects/hooks/use-projects'

// Rows are uniform (a ChatRow is an h-8 button plus a 2px gap), so a fixed size keeps
// the virtualizer far simpler than the message list's measured heights.
const ROW_HEIGHT = 34
const OVERSCAN = 8
// Start fetching the next page once the user is within this many rows of the end.
const LOAD_MORE_THRESHOLD = 5

type AllChatsViewProps = {
  // Global (null) or a single project's chats.
  scope: string | null
}

export function AllChatsView({ scope }: AllChatsViewProps) {
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const selectChat = useChatStore((s) => s.selectChat)
  const closeAllChats = useChatStore((s) => s.closeAllChats)

  const { data: projects = [] } = useProjects()
  const { data: pinned = [] } = usePinnedChats(scope)
  const chatsQuery = useChats(scope)
  const rows = flattenChatPages(chatsQuery.data)

  const title = scope ? (projects.find((p) => p.id === scope)?.name ?? 'All chats') : 'All chats'

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index].id,
    overscan: OVERSCAN,
  })

  const virtualItems = virtualizer.getVirtualItems()
  useLoadMoreOnScroll({
    lastVisibleIndex: virtualItems.at(-1)?.index ?? 0,
    rowCount: rows.length,
    hasNextPage: chatsQuery.hasNextPage,
    isFetchingNextPage: chatsQuery.isFetchingNextPage,
    fetchNextPage: chatsQuery.fetchNextPage,
    threshold: LOAD_MORE_THRESHOLD,
  })

  const listEmpty = rows.length === 0 && !chatsQuery.isLoading

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden z-base">
      {/* Header / drag bar — back control, then the title. The search bar will slot in
          here later; nothing is built for it yet. */}
      <div
        className={cn(
          'flex items-center gap-2 h-[50px] shrink-0 electrobun-webkit-app-region-drag',
          sidebarOpen ? 'px-6' : 'pl-(--layout-header-inset) pr-6',
        )}
      >
        <button
          onClick={closeAllChats}
          title="Back"
          className="flex items-center justify-center h-8 w-8 rounded-lg text-subtle hover:text-foreground hover:bg-surface-hover transition-colors electrobun-webkit-app-region-no-drag"
        >
          <IconChevronLeft width={16} />
        </button>
        <span className="text-sm font-semibold text-foreground truncate electrobun-webkit-app-region-no-drag">
          {title}
        </span>
      </div>

      {/* Centred content column */}
      <div className="flex flex-col flex-1 min-h-0 max-w-160 w-full mx-auto px-6 pb-4">
        {pinned.length > 0 && (
          <section className="shrink-0 pb-2">
            <h2 className="px-2 py-1.5 text-2xs font-semibold text-subtle uppercase tracking-wider">
              Pinned
            </h2>
            <ul className="px-2">
              {pinned.map((c) => (
                <ChatRow
                  key={c.id}
                  chatItem={c}
                  selected={selectedChatId === c.id}
                  onSelect={() => selectChat(c.id)}
                  pinned
                />
              ))}
            </ul>
          </section>
        )}

        {listEmpty && <div className="px-2 py-3 text-xs text-subtle italic">No chats yet</div>}

        {/* Virtualized unpinned list. Each row sits in an absolutely positioned wrapper,
            so ChatRow's own list item is rendered inside these wrappers rather than a ul. */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-2">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualItems.map((vi) => {
              const c = rows[vi.index]
              return (
                <div
                  key={vi.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ChatRow
                    chatItem={c}
                    selected={selectedChatId === c.id}
                    onSelect={() => selectChat(c.id)}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {chatsQuery.isFetchingNextPage && (
          <div className="shrink-0 py-2 text-center text-xs text-subtle">Loading more…</div>
        )}
      </div>
    </main>
  )
}
