import type { ChatDTO } from '@shared/schemas/chat.schema'
import { DATE_GROUP_LABELS, DATE_GROUPS, type DateGroup, dateGroup } from '@utils/time'

export function sortChats(chats: ChatDTO[]): ChatDTO[] {
  return [...chats].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  )
}

export type ChatGroup = {
  key: DateGroup
  label: string
  chats: ChatDTO[]
}

export function groupChatsByDate(chats: ChatDTO[]): ChatGroup[] {
  const groups = new Map<DateGroup, ChatDTO[]>()

  for (const chat of sortChats(chats)) {
    const key = dateGroup(chat.lastMessageAt)
    const list = groups.get(key) ?? []
    list.push(chat)
    groups.set(key, list)
  }

  return DATE_GROUPS.filter((k) => groups.has(k)).map((k) => ({
    key: k,
    label: DATE_GROUP_LABELS[k],
    chats: groups.get(k)!,
  }))
}
