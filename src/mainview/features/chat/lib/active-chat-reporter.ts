import { electroview } from '@/lib/rpc.client'
import { useNavigationStore } from '@/store/navigation.store'

/**
 * Mirrors selectedChatId changes to the bun process so the control server
 * can resolve target:"active" in POST /prompt requests.
 */
export function initActiveChatReporter(): void {
  useNavigationStore.subscribe((state, prev) => {
    if (state.selectedChatId !== prev.selectedChatId) {
      electroview.rpc?.request.setActiveChat({ chatId: state.selectedChatId }).catch(() => {})
    }
  })
}
