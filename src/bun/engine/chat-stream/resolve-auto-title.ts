import { type ChatDTO, DEFAULT_CHAT_TITLE } from '../../../shared-contracts/schemas/chat.schema'
import {
  type MessageDTO,
  MessageRole,
  PartKind,
} from '../../../shared-contracts/schemas/message.schema'

// Decide whether a chat should be auto-titled this turn, and from what text. Returns
// the first user message's text while the chat is still unnamed, else null. Pure: the
// caller supplies the chat row and history, so the guard is tested without the IO
// body. Keyed only on the still-default title (not on being the first exchange), so
// it stays idempotent and can run every turn, letting a title that failed to generate
// earlier self-heal on a later turn.
export function resolveAutoTitle(chat: ChatDTO | undefined, history: MessageDTO[]): string | null {
  if (chat?.title !== DEFAULT_CHAT_TITLE) {
    return null
  }

  const firstUser = history.find((m) => m.role === MessageRole.enum.user)
  if (!firstUser) {
    return null
  }

  const text = firstUser.parts
    .filter(
      (p): p is Extract<MessageDTO['parts'][number], { type: 'text' }> =>
        p.type === PartKind.enum.text,
    )
    .map((p) => p.text)
    .join(' ')
    .trim()

  return text || null
}
