import type { ChatDTO } from '@shared/schemas/chat.schema'

// The chat's display title, falling back to a placeholder for untitled chats.
export function chatTitle(chat: ChatDTO): string {
  return chat.title || 'Untitled chat'
}
