import React from 'react'
import { useMountEffect } from '@/hooks/use-mount-effect'

const FULLSCREEN_CHANGE_EVENT = 'fullscreenchange'

/**
 * Drives OS fullscreen from the overlay's lifecycle: requests it on mount,
 * releases it on unmount. Also calls `onExit` when fullscreen ends by other
 * means (the user pressing Esc), so the caller can close focus mode in sync.
 *
 * Returns `isFullscreen` (live) and `toggleFullscreen` so the nav can expose a
 * manual fullscreen button. This matters because the auto-request on mount is
 * rejected without a user gesture (external control prompts have no gesture).
 *
 * Pairs with conditional mounting. The overlay mounts only while focus mode is
 * open, and this hook keeps fullscreen aligned with that lifetime.
 */
export function useFocusModeFullscreen(
  elementRef: React.RefObject<HTMLElement | null>,
  onExit: () => void,
): { isFullscreen: boolean; toggleFullscreen: () => void } {
  const onExitRef = React.useRef(onExit)
  onExitRef.current = onExit

  const [isFullscreen, setIsFullscreen] = React.useState(() => document.fullscreenElement != null)

  useMountEffect(() => {
    elementRef.current?.requestFullscreen().catch(() => {})

    const handleChange = () => {
      const full = document.fullscreenElement != null
      setIsFullscreen(full)
      if (!full) {
        onExitRef.current()
      }
    }
    document.addEventListener(FULLSCREEN_CHANGE_EVENT, handleChange)

    return () => {
      document.removeEventListener(FULLSCREEN_CHANGE_EVENT, handleChange)
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  })

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else {
      elementRef.current?.requestFullscreen().catch(() => {})
    }
  }, [elementRef])

  return { isFullscreen, toggleFullscreen }
}
