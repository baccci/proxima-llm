import type { ChatDTO } from '@shared/schemas/chat.schema'
import { ScrollArea } from '@/components/scroll-area'
import { useChatStore } from '@/features/chat/store/chat.store'
import { groupChatsByDate } from '@/features/sidebar/entities/helpers'
import { ChatRow } from './chat-row'

interface Props {
  chats: ChatDTO[]
}

export function SidebarChatList({ chats }: Props) {
  const { selectedChatId, selectChat } = useChatStore()
  const groups = groupChatsByDate(chats)

  if (groups.length === 0) {
    return <div className="px-4 py-3 text-xs text-subtle italic">No chats yet</div>
  }

  return (
    <ScrollArea className="flex-1">
      {groups.map((group) => (
        <div key={group.key} className="mb-1">
          <div className="px-4 py-1.5 text-2xs font-semibold text-subtle uppercase tracking-wider">
            {group.label}
          </div>
          <ul>
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
    </ScrollArea>
  )
}
