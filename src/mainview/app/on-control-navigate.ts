import { attachToStream } from '@/features/chat/lib/attach-stream'
import { jumpInto } from '@/features/chat/lib/jump-into-stream'
import { NEWEST_EXCHANGE, useFocusModeStore } from '@/features/focus-mode/store/focus-mode.store'
import { queryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import type { ControlNavigatePayload } from '@/lib/rpc.client'
import { useNavigationStore } from '@/store/navigation.store'

/**
 * Decide what the bun process's control-navigate push should do to the window. This lives
 * in app/ because the decision spans navigation, chat and focus mode at once, and app/ is
 * the layer allowed to reach across features. main.tsx subscribes it to the transport.
 */
export function onControlNavigate(payload: ControlNavigatePayload): void {
  const focusMode = useFocusModeStore.getState()

  if (!focusMode.isOpen) {
    useNavigationStore.getState().selectChat(payload.chatId)
    attachToStream(payload.streamId, payload.assistantMessageId, payload.chatId)
    if (payload.focus) {
      focusMode.open(NEWEST_EXCHANGE)
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

  focusMode.setPendingIncoming(payload)
}
