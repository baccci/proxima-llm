import type React from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'

const KEYDOWN_EVENT = 'keydown'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Traps Tab focus inside the container for its lifetime. Mount this only while
 * the modal is open (conditional mounting) so the listener ties to mount and
 * unmount. `active` lets a caller opt out of trapping without unmounting.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, active: boolean): void {
  useMountEffect(() => {
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
        const target = e.shiftKey ? last : first
        target.focus()
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

    container.addEventListener(KEYDOWN_EVENT, handleKey)
    return () => container.removeEventListener(KEYDOWN_EVENT, handleKey)
  })
}
