import type { AppRPC } from '@shared/rpc/app-rpc.types'
import { chat } from '@/features/chat/chat.api'
import { useChatStore } from '@/features/chat/store/chat.store'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import { useNavigationStore } from '@/store/navigation.store'
import { attachToStream } from './attach-stream'

type Payload = AppRPC['webview']['messages']['controlNavigate']
type JumpTarget = Pick<Payload, 'chatId' | 'streamId' | 'assistantMessageId'>

const NEWEST = Number.MAX_SAFE_INTEGER

export function jumpInto(p: JumpTarget): void {
  const s = useChatStore.getState()
  useNavigationStore.getState().selectChat(p.chatId)
  attachToStream(p.streamId, p.assistantMessageId, p.chatId)
  // Ensure a completed stream renders fully if we missed the done chunk.
  chat.invalidateMessages(p.chatId)
  s.setFocusModeOpen(true)
  s.setFocusModeExchangeIndex(NEWEST)
}

export function onControlNavigate(payload: Payload): void {
  const s = useChatStore.getState()

  if (!s.focusModeOpen) {
    useNavigationStore.getState().selectChat(payload.chatId)
    attachToStream(payload.streamId, payload.assistantMessageId, payload.chatId)
    if (payload.focus) {
      s.setFocusModeOpen(true)
      s.setFocusModeExchangeIndex(NEWEST)
    }
    return
  }

  const sameChat = payload.chatId === useNavigationStore.getState().selectedChatId
  const cachedSettings = queryClient.getQueryData(queryKeys.settings()) as
    | { focusFollowsIncoming?: boolean }
    | undefined
  const follows = cachedSettings?.focusFollowsIncoming ?? true

  if (sameChat || follows) {
    jumpInto(payload)
    return
  }

  s.setPendingIncoming(payload)
}
