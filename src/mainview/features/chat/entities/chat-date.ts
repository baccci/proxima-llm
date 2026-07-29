import type { ChatDTO } from '@shared/schemas/chat.schema'
import { dateFormatter } from '../helpers/date-formatter'

// The chat's display date, or null when the chat has no date yet.
export function chatDate(chat: ChatDTO): string | null {
  if (!chat.lastMessageAt) {
    return null
  }

  return dateFormatter(new Date(chat.lastMessageAt))
}
