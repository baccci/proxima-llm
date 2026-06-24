import React from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'

const KEYDOWN_EVENT = 'keydown'

// Keys (incl. vim-style aliases) bound to each focus-mode action.
const NAV_KEYS: Record<'prev' | 'next' | 'togglePrompt' | 'jumpIncoming', readonly string[]> = {
  prev: ['ArrowLeft', 'j'],
  next: ['ArrowRight', 'l'],
  togglePrompt: ['p'],
  jumpIncoming: ['f'],
}

interface FocusModeKeyHandlers {
  onPrev: () => void
  onNext: () => void
  onTogglePrompt: () => void
  onJumpIncoming?: () => void
}

/**
 * Binds the focus-mode keyboard shortcuts for the lifetime of the component.
 * Handlers are read through a ref so the listener is attached once on mount yet
 * always invokes the latest closures (which capture the current index/state).
 */
export function useFocusModeKeyboard(handlers: FocusModeKeyHandlers) {
  const handlersRef = React.useRef(handlers)
  handlersRef.current = handlers

  useMountEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { onPrev, onNext, onTogglePrompt, onJumpIncoming } = handlersRef.current
      if (NAV_KEYS.prev.includes(e.key)) onPrev()
      else if (NAV_KEYS.next.includes(e.key)) onNext()
      else if (NAV_KEYS.togglePrompt.includes(e.key)) onTogglePrompt()
      else if (NAV_KEYS.jumpIncoming.includes(e.key)) onJumpIncoming?.()
    }
    document.addEventListener(KEYDOWN_EVENT, handleKeyDown)
    return () => document.removeEventListener(KEYDOWN_EVENT, handleKeyDown)
  })
}
