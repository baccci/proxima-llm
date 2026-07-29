import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { ChatRow } from '@/features/chat/components/chat-row'
import { flattenChatPages } from '@/features/chat/helpers/flatten-chat-pages'
import { useChats, usePinnedChats } from '@/features/chat/hooks/use-chats'
import { useLoadMoreOnScroll } from '@/features/chat/hooks/use-load-more-on-scroll'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useProjects } from '@/features/projects/hooks/use-projects'

// Initial estimate only. Each row is measured after mount (measureElement below), so the
// virtualizer positions rows by their real rendered height rather than a guessed constant.
// A wrong guess here only affects the very first paint before measurement corrects it.
const ROW_ESTIMATE = 44
const OVERSCAN = 8
// Start fetching the next page once the user is within this many rows of the end.
const LOAD_MORE_THRESHOLD = 5

type AllChatsViewProps = {
  // Global (null) or a single project's chats.
  scope: string | null
}

export function AllChatsView({ scope }: AllChatsViewProps) {
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const selectChat = useChatStore((s) => s.selectChat)

  const { data: projects = [] } = useProjects()
  const { data: pinned = [] } = usePinnedChats(scope)
  const chatsQuery = useChats(scope)
  const rows = flattenChatPages(chatsQuery.data)

  const project = projects.find((p) => p.id === scope)
  const title = project?.name ?? 'Chat list'

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
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
    <main className="flex flex-col flex-1 h-full overflow-hidden z-base px-12 max-w-250 mx-auto">
      {/* Header / drag bar with the title. The search bar will slot in here later;
          nothing is built for it yet. */}
      <div
        className={cn('flex items-center gap-2 h-30 shrink-0 electrobun-webkit-app-region-drag')}
      >
        <h1 className="text-2xl font-semibold text-foreground truncate electrobun-webkit-app-region-no-drag">
          {title}
        </h1>
      </div>

      {/* Centred content column */}
      <div className="flex flex-col flex-1 min-h-0 w-full mx-auto  pb-4">
        {pinned.length > 0 && (
          <section className="shrink-0 pb-2">
            <h2 className="px-2 py-1.5 text-2xs font-semibold text-subtle uppercase tracking-wider">
              Pinned
            </h2>
            <ul className="space-y-1">
              {pinned.map((c) => (
                <ChatRow
                  key={c.id}
                  chatItem={c}
                  selected={selectedChatId === c.id}
                  onSelect={() => selectChat(c.id)}
                  variant="chatList"
                  pinned
                />
              ))}
            </ul>
          </section>
        )}

        {listEmpty && <div className="px-2 py-3 text-xs text-subtle italic">No chats yet</div>}

        {/* Virtualized unpinned list. Each row sits in an absolutely positioned wrapper,
            so ChatRow's own list item is rendered inside these wrappers rather than a ul. */}
        <hr className="max-w-[80%] ml-2 mb-2" />
        <section className="flex-1 min-h-0 overflow-y-auto" ref={scrollRef}>
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualItems.map((vi) => {
              const c = rows[vi.index]
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="pb-1"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ChatRow
                    chatItem={c}
                    selected={selectedChatId === c.id}
                    onSelect={() => selectChat(c.id)}
                    variant="chatList"
                  />
                </div>
              )
            })}
          </div>
        </section>

        {chatsQuery.isFetchingNextPage && (
          <div className="shrink-0 py-2 text-center text-xs text-subtle">Loading more…</div>
        )}
      </div>
    </main>
  )
}
