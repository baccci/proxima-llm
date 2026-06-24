import { useChatStore } from '@/features/chat/store/chat.store'
import { electroview } from '@/lib/rpc.client'

/**
 * Mirrors selectedChatId changes to the bun process so the control server
 * can resolve target:"active" in POST /prompt requests.
 */
export function initActiveChatReporter(): void {
  useChatStore.subscribe((state, prev) => {
    if (state.selectedChatId !== prev.selectedChatId) {
      electroview.rpc?.request.setActiveChat({ chatId: state.selectedChatId }).catch(() => {})
    }
  })
}
