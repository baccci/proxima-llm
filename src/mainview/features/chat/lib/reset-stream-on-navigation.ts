import { useChatStore } from '@/features/chat/store/chat.store'
import { useNavigationStore } from '@/store/navigation.store'

/**
 * Drops the in-flight stream view when the open chat changes. The navigation store
 * owns which chat is open and must not reach into a feature, so the chat feature
 * listens instead. Re-selecting the chat already open is not a change, so a live
 * stream survives it.
 */
export function initStreamResetOnNavigation(): void {
  useNavigationStore.subscribe((state, prev) => {
    if (state.selectedChatId !== prev.selectedChatId) {
      useChatStore.getState().resetForChatChange()
    }
  })
}
