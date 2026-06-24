import React from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, active: boolean): void {
  React.useEffect(() => {
    if (!active) {
      return
    }
    const container = containerRef.current
    if (!container) {
      return
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') {
        return
      }
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.closest('[aria-hidden]'),
      )
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const currentFocus = document.activeElement

      if (!container.contains(currentFocus)) {
        e.preventDefault()
        e.shiftKey ? last.focus() : first.focus()
        return
      }
      if (e.shiftKey && currentFocus === first) {
        e.preventDefault()
        last.focus()
        return
      }
      if (!e.shiftKey && currentFocus === last) {
        e.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKey)
    return () => container.removeEventListener('keydown', handleKey)
  }, [active, containerRef])
}
