import type { ChatDTO } from '@shared/schemas/chat.schema'
import { ScrollArea } from '@/components/scroll-area'
import { ChatRow } from '@/features/chat/components/chat-row'
import { useChatStore } from '@/features/chat/store/chat.store'
import { groupChatsByDate } from '@/features/sidebar/entities/helpers'

type SidebarChatListProps = {
  chats: ChatDTO[]
  showSeeAll?: boolean
}

export function SidebarChatList({ chats, showSeeAll }: SidebarChatListProps) {
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const selectChat = useChatStore((s) => s.selectChat)
  const groups = groupChatsByDate(chats)
  const openAllChats = useChatStore((s) => s.openAllChats)

  if (groups.length === 0) {
    return <div className="px-4 py-3 text-xs text-subtle italic">No chats yet</div>
  }

  return (
    <ScrollArea className="flex-1">
      {groups.map((group) => (
        <div key={group.key} className="mb-1">
          <div className="px-4 py-1.5 text-2xs text-subtle tracking-wider">{group.label}</div>
          <ul className="px-2">
            {group.chats.map((c) => (
              <ChatRow
                key={c.id}
                chatItem={c}
                selected={selectedChatId === c.id}
                onSelect={() => selectChat(c.id)}
              />
            ))}
          </ul>
        </div>
      ))}
      {/* Sits outside the scroll area so it never scrolls away. Shown only when there is
          more than the capped page 0 to see. */}
      {showSeeAll && (
        <button
          onClick={() => openAllChats(null)}
          className="shrink-0 flex items-center w-[calc(100%-1rem)] mx-2 mb-1 px-2 h-8 rounded-lg text-sm text-subtle hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See all chats
        </button>
      )}
    </ScrollArea>
  )
}
