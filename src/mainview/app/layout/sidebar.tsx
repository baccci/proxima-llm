import React from 'react'
import { IconPlus } from '@/components/icons/icon-plus'
import { IconSearch } from '@/components/icons/icon-search'
import { chat } from '@/features/chat/chat.api'
import { useChats } from '@/features/chat/hooks/use-chats'
import { useChatStore } from '@/features/chat/store/chat.store'
import { SidebarChatList } from '@/features/sidebar/components/sidebar-chat-list'
import { SidebarFooter } from '@/features/sidebar/components/sidebar-footer'
import { SidebarPinnedChats } from '@/features/sidebar/components/sidebar-pinned-chats'
import { SidebarProjects } from '@/features/sidebar/components/sidebar-projects'

export function Sidebar() {
  const { data: allChats = [] } = useChats(null)
  const selectChat = useChatStore((s) => s.selectChat)
  const [search, setSearch] = React.useState('')

  const pinned = allChats.filter((c) => c.pinned)
  const unpinned = allChats.filter((c) => !c.pinned)

  const filteredUnpinned = search.trim()
    ? unpinned.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : unpinned

  async function handleNewChat() {
    const created = await chat.create({})
    selectChat(created.id)
  }

  return (
    <aside className="flex flex-col w-(--layout-sidebar-w) h-full rounded-lg border border-border bg-panel shadow-modal shrink-0 overflow-hidden z-base">
      {/* Native traffic lights appear here via hiddenInset + trafficLightOffset */}
      <div className="h-8 shrink-0 electrobun-webkit-app-region-drag" />

      {/* Search */}
      <div className="px-2 pb-2 shrink-0">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2 h-8">
          <IconSearch width={14} className="text-subtle shrink-0" />
          <input
            type="text"
            placeholder="Search chats…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-subtle outline-none min-w-0"
          />
        </div>
      </div>

      {/* New chat */}
      <div className="px-2 pb-1 shrink-0">
        <button
          onClick={handleNewChat}
          disabled={false}
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

      {/* Scrollable chat list — takes remaining height */}
      <SidebarChatList chats={filteredUnpinned} />

      <SidebarFooter />
    </aside>
  )
}
