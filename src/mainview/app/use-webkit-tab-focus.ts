import { useMountEffect } from '@/hooks/use-mount-effect'

/**
 * WebKit (WKWebView, our renderer) excludes native <button> from the sequential
 * Tab order unless they carry an explicit tabindex — by default only text fields
 * and tabindex-bearing elements are tabbable. Base UI controls set their own
 * tabindex via useButton; our hand-rolled <button>s don't, so they're unreachable
 * by keyboard (chat rows, composer toggles, focus-mode nav, …).
 *
 * Normalize every plain <button> — one with no tabindex of its own — to
 * tabindex="0", on mount and for anything mounted later. Buttons that already
 * manage their own tabindex (Base UI roving focus, an intentional -1) carry the
 * attribute, so `:not([tabindex])` skips them and we never fight their focus logic.
 */
const PLAIN_BUTTON = 'button:not([tabindex])'

function normalize(root: ParentNode) {
  for (const el of root.querySelectorAll<HTMLButtonElement>(PLAIN_BUTTON)) {
    // Reflects to tabindex="0", so the node no longer matches PLAIN_BUTTON —
    // and we observe childList only, so this write can't retrigger the observer.
    el.tabIndex = 0
  }
}

export function useWebkitTabFocus() {
  useMountEffect(() => {
    normalize(document.body)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          if (node.matches(PLAIN_BUTTON)) node.tabIndex = 0
          normalize(node)
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  })
}
