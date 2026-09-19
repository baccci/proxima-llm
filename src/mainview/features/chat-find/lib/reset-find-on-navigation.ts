import { useChatFindStore } from '@/features/chat-find/store/chat-find.store'
import { useNavigationStore } from '@/store/navigation.store'

/**
 * Closes in-chat find when the open chat changes. Matches belong to one chat, so
 * carrying the bar and its "n of m" across a navigation would show a count for messages
 * that are no longer on screen. The navigation store must not reach into a feature, so
 * the find feature listens instead, the same way the chat feature drops its stream.
 */
export function initFindResetOnNavigation(): void {
  useNavigationStore.subscribe((state, prev) => {
    if (state.selectedChatId !== prev.selectedChatId) {
      useChatFindStore.getState().reset()
    }
  })
}
