import React from 'react'

// Max height (px) the textarea grows to before it starts scrolling.
const MAX_HEIGHT = 272

// Grow a textarea with its content up to a max height, then scroll. Returns the
// ref plus imperative helpers for the change path (grow) and the submit path (reset).
export function useAutoResizeTextarea() {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  function autoResize() {
    const el = ref.current
    if (!el) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }

  function reset() {
    if (ref.current) {
      ref.current.style.height = 'auto'
    }
  }

  return { ref, autoResize, reset }
}
