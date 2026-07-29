import type { ChatDTO, ChatPage } from '@shared/schemas/chat.schema'
import type { InfiniteData } from '@tanstack/react-query'

// Flatten the infinite query's pages into one newest-first list, dropping any chat
// seen twice. A new message bumps a chat's recency, so it can jump to an earlier page
// mid-scroll; deduping by id keeps it from showing in two places at once.
export function flattenChatPages(data: InfiniteData<ChatPage> | undefined): ChatDTO[] {
  const seen = new Set<string>()
  const out: ChatDTO[] = []
  for (const page of data?.pages ?? []) {
    for (const chat of page.items) {
      if (seen.has(chat.id)) {
        continue
      }
      seen.add(chat.id)
      out.push(chat)
    }
  }
  return out
}
