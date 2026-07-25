import { type MessageDTO, MessageRole } from '@shared/schemas/message.schema'

/** A user turn paired with the assistant reply it received, if any. */
export type Exchange = {
  userMessage: MessageDTO
  assistantMessage: MessageDTO | null
}

/**
 * Groups a flat message list into user/assistant exchanges for focus mode.
 *
 * System messages are dropped. Each user message is paired with the assistant
 * message that follows it; a user turn with no reply yet gets a null
 * assistantMessage. An assistant message with no user turn before it is an
 * orphan and is skipped.
 */
export function groupIntoExchanges(messages: MessageDTO[]): Exchange[] {
  const exchanges: Exchange[] = []
  const filtered = messages.filter((m) => m.role !== MessageRole.enum.system)

  let i = 0
  while (i < filtered.length) {
    const msg = filtered[i]

    // An assistant message with no user turn before it is an orphan: skip it.
    if (msg.role !== MessageRole.enum.user) {
      i += 1
      continue
    }

    const next = filtered[i + 1]
    const reply = next?.role === MessageRole.enum.assistant ? next : null
    exchanges.push({ userMessage: msg, assistantMessage: reply })
    i += reply ? 2 : 1
  }

  return exchanges
}
