import { type MessageDTO, MessageRole } from '@shared/schemas/message.schema'

export type Exchange = {
  userMessage: MessageDTO
  assistantMessage: MessageDTO | null
}

export function groupIntoExchanges(messages: MessageDTO[]): Exchange[] {
  const exchanges: Exchange[] = []
  const filtered = messages.filter((m) => m.role !== MessageRole.enum.system)

  let i = 0
  while (i < filtered.length) {
    const msg = filtered[i]
    if (msg.role === MessageRole.enum.user) {
      const next = filtered[i + 1]
      if (next?.role === MessageRole.enum.assistant) {
        exchanges.push({ userMessage: msg, assistantMessage: next })
        i += 2
      } else {
        exchanges.push({ userMessage: msg, assistantMessage: null })
        i += 1
      }
    } else {
      // Orphaned leading assistant message — skip
      i += 1
    }
  }

  return exchanges
}
