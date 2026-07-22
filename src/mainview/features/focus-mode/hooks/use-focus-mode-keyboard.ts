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

type FocusModeKeyHandlers = {
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
      // Dispatch by first key-group that matches, so there is no if/else ladder.
      const action = [
        { keys: NAV_KEYS.prev, run: onPrev },
        { keys: NAV_KEYS.next, run: onNext },
        { keys: NAV_KEYS.togglePrompt, run: onTogglePrompt },
        { keys: NAV_KEYS.jumpIncoming, run: onJumpIncoming },
      ].find((entry) => entry.keys.includes(e.key))
      action?.run?.()
    }
    document.addEventListener(KEYDOWN_EVENT, handleKeyDown)
    return () => document.removeEventListener(KEYDOWN_EVENT, handleKeyDown)
  })
}
