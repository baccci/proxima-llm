import React from 'react'

type Options = {
  isOpen: boolean
  onClose: () => void
  closeOnEscape: boolean
  lockScroll: boolean
  restoreFocus: boolean
  initialFocus?: React.RefObject<HTMLElement>
}

export function useModalBehavior({
  isOpen,
  onClose,
  closeOnEscape,
  lockScroll,
  restoreFocus,
  initialFocus,
}: Options): {
  panelRef: React.RefObject<HTMLDivElement>
} {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const previousFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!isOpen) {
      return
    }
    previousFocusRef.current = document.activeElement as HTMLElement
    const focusTarget = initialFocus?.current ?? panelRef.current
    focusTarget?.focus()
    if (lockScroll) {
      document.body.style.overflow = 'hidden'
    }
    const handleKey = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      if (lockScroll) {
        document.body.style.overflow = ''
      }
      if (restoreFocus) {
        previousFocusRef.current?.focus()
      }
    }
  }, [isOpen, onClose, closeOnEscape, lockScroll, restoreFocus, initialFocus])

  return { panelRef }
}
