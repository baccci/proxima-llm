import { IconPlus } from '@/components/icons/icon-plus'
import { chat } from '@/features/chat/chat.api'
import { SIDEBAR_CHAT_LIMIT } from '@/features/chat/constants'
import { flattenChatPages } from '@/features/chat/helpers/flatten-chat-pages'
import { useChats, usePinnedChats } from '@/features/chat/hooks/use-chats'
import { useChatStore } from '@/features/chat/store/chat.store'
import { SidebarChatList } from '@/features/sidebar/components/sidebar-chat-list'
import { SidebarFooter } from '@/features/sidebar/components/sidebar-footer'
import { SidebarPinnedChats } from '@/features/sidebar/components/sidebar-pinned-chats'
import { SidebarProjects } from '@/features/sidebar/components/sidebar-projects'

export function Sidebar() {
  const chatsQuery = useChats(null)
  const { data: pinned = [] } = usePinnedChats(null)
  const selectChat = useChatStore((s) => s.selectChat)

  // Only page 0 (capped) shows in the sidebar; the full list lives in the All-chats view.
  const loaded = flattenChatPages(chatsQuery.data)
  const recents = loaded.slice(0, SIDEBAR_CHAT_LIMIT)
  const showSeeAll = chatsQuery.hasNextPage || loaded.length > SIDEBAR_CHAT_LIMIT

  async function handleNewChat() {
    const created = await chat.create({})
    selectChat(created.id)
  }

  return (
    <aside className="flex flex-col w-(--layout-sidebar-w) h-full rounded-lg border border-border bg-panel shadow-modal shrink-0 overflow-hidden z-base">
      {/* Native traffic lights appear here via hiddenInset + trafficLightOffset */}
      <div className="h-8 shrink-0 electrobun-webkit-app-region-drag" />

      {/* New chat */}
      <div className="px-2 pb-1 shrink-0">
        <button
          onClick={handleNewChat}
          className="flex items-center gap-2 w-full px-2 h-8 rounded-lg text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconPlus width={15} className="shrink-0" />
          <span>New chat</span>
        </button>
      </div>

      <div className="h-px bg-border shrink-0 mx-4 my-1" />

      {/* Projects */}
      <SidebarProjects />

      <div className="h-px bg-border shrink-0 mx-4 my-1" />

      {/* Pinned chats */}
      <SidebarPinnedChats chats={pinned} />

      {/* Scrollable chat list, takes remaining height */}
      <SidebarChatList chats={recents} showSeeAll={showSeeAll} />

      <SidebarFooter />
    </aside>
  )
}
