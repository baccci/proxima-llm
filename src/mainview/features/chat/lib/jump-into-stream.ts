import { chat } from '@/features/chat/chat.api'
import { NEWEST_EXCHANGE, useFocusModeStore } from '@/features/focus-mode/store/focus-mode.store'
import type { ControlNavigatePayload } from '@/lib/rpc.client'
import { useNavigationStore } from '@/store/navigation.store'
import { attachToStream } from './attach-stream'

type JumpTarget = Pick<ControlNavigatePayload, 'chatId' | 'streamId' | 'assistantMessageId'>

/**
 * Open a chat on its already-running stream: select it, attach to the stream, and drop
 * into focus mode on the newest exchange. Used by the control-navigate policy in app/ and
 * by focus mode's "jump to the incoming prompt" banner.
 */
export function jumpInto(p: JumpTarget): void {
  useNavigationStore.getState().selectChat(p.chatId)
  attachToStream(p.streamId, p.assistantMessageId, p.chatId)
  // Ensure a completed stream renders fully if we missed the done chunk.
  chat.invalidateMessages(p.chatId)
  useFocusModeStore.getState().open(NEWEST_EXCHANGE)
}
