import React from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'

const KEYDOWN_EVENT = 'keydown'

type Options = {
  panelRef: React.RefObject<HTMLDivElement>
  onClose: () => void
  closeOnEscape: boolean
  lockScroll: boolean
  restoreFocus: boolean
  initialFocus?: React.RefObject<HTMLElement>
}

/**
 * Wires an open modal's imperative behavior for its lifetime: focus the panel,
 * lock body scroll, close on Escape, and restore focus to the trigger on close.
 * Mount this only while the modal is open (conditional mounting) so setup ties
 * to mount and teardown to unmount. onClose and closeOnEscape are read through a
 * ref so the Escape listener attaches once yet always calls the latest values.
 */
export function useModalBehavior({
  panelRef,
  onClose,
  closeOnEscape,
  lockScroll,
  restoreFocus,
  initialFocus,
}: Options): void {
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  const latestRef = React.useRef({ onClose, closeOnEscape })
  latestRef.current = { onClose, closeOnEscape }

  useMountEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement

    const focusTarget = initialFocus?.current ?? panelRef.current
    focusTarget?.focus()

    if (lockScroll) {
      document.body.style.overflow = 'hidden'
    }

    const handleKey = (e: KeyboardEvent) => {
      const latest = latestRef.current

      if (latest.closeOnEscape && e.key === 'Escape') {
        latest.onClose()
      }
    }

    document.addEventListener(KEYDOWN_EVENT, handleKey)

    return () => {
      document.removeEventListener(KEYDOWN_EVENT, handleKey)

      if (lockScroll) {
        document.body.style.overflow = ''
      }

      if (restoreFocus) {
        previousFocusRef.current?.focus()
      }
    }
  })
}
