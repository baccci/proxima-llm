import { modal } from '@/components/modal'
import { SEARCH_MODAL_ID } from '@/features/chat/constants'
import { useMountEffect } from '@/hooks/use-mount-effect'

const KEYDOWN_EVENT = 'keydown'
const SEARCH_KEY = 'k'

// Cmd+K, or Ctrl+K away from macOS, opens the search palette from anywhere in the app.
// Bound once for the app's lifetime, so nothing here depends on changing values.
export function useSearchShortcut(): void {
  useMountEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const withModifier = e.metaKey || e.ctrlKey
      if (!withModifier || e.key.toLowerCase() !== SEARCH_KEY) {
        return
      }

      // The browser binds Cmd+K to its own search box, so take the key.
      e.preventDefault()
      modal.toggle(SEARCH_MODAL_ID)
    }

    document.addEventListener(KEYDOWN_EVENT, handleKeyDown)
    return () => document.removeEventListener(KEYDOWN_EVENT, handleKeyDown)
  })
}
