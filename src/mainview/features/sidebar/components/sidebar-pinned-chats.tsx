import type { ChatDTO } from '@shared/schemas/chat.schema'
import { cn } from '@utils/tailwind-class-merge'
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from '@/components/collapsible'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { ChatRow } from '@/features/chat/components/chat-row'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useSidebarStore } from '@/features/sidebar/store/sidebar.store'

type SidebarPinnedChatsProps = {
  chats: ChatDTO[]
}

export function SidebarPinnedChats({ chats }: SidebarPinnedChatsProps) {
  const selectedChatId = useChatStore((s) => s.selectedChatId)
  const selectChat = useChatStore((s) => s.selectChat)
  const pinnedCollapsed = useSidebarStore((s) => s.pinnedCollapsed)
  const togglePinned = useSidebarStore((s) => s.togglePinned)

  if (chats.length === 0) {
    return null
  }

  return (
    <CollapsibleRoot open={!pinnedCollapsed} onOpenChange={() => togglePinned()}>
      <div className="flex items-center px-4 py-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-2xs font-semibold text-subtle uppercase tracking-wider hover:text-muted transition-colors">
          <IconChevronRight
            width={12}
            className={cn('transition-transform duration-200', !pinnedCollapsed && 'rotate-90')}
          />
          Pinned
        </CollapsibleTrigger>
      </div>

      <CollapsiblePanel>
        <ul className="px-2 pb-1">
          {chats.map((c) => (
            <ChatRow
              key={c.id}
              chatItem={c}
              selected={selectedChatId === c.id}
              onSelect={() => selectChat(c.id)}
              pinned
            />
          ))}
        </ul>
      </CollapsiblePanel>
    </CollapsibleRoot>
  )
}
