import React from 'react'
import { useChatFindStore } from '@/features/chat-find/store/chat-find.store'
import { useMountEffect } from '@/hooks/use-mount-effect'

const KEYDOWN_EVENT = 'keydown'
const FIND_KEY = 'f'
const FIND_AGAIN_KEY = 'g'

type FindShortcutDeps = {
  // How many matches the current query has, so Cmd+G knows where to wrap around.
  total: number
  // False on the welcome screen, where there is no chat to search and the key should go
  // back to meaning whatever it otherwise means.
  enabled: boolean
}

// Cmd+F opens in-chat find, and Cmd+G / Cmd+Shift+G step through the matches without
// leaving the message list. The deps are read through a ref so the listener attaches once
// on mount yet always sees the current count, per docs/conventions/react.md.
export function useFindShortcut(deps: FindShortcutDeps): void {
  const depsRef = React.useRef(deps)
  depsRef.current = deps

  useMountEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { total, enabled } = depsRef.current
      if (!enabled || (!e.metaKey && !e.ctrlKey)) {
        return
      }

      const key = e.key.toLowerCase()
      if (key === FIND_KEY) {
        // WebKit binds Cmd+F to its own find bar, which can only see the handful of rows
        // the virtualizer has mounted. Take the key and search the whole chat instead.
        e.preventDefault()
        useChatFindStore.getState().open()
        return
      }

      if (key === FIND_AGAIN_KEY && useChatFindStore.getState().isOpen) {
        e.preventDefault()
        useChatFindStore.getState().step(e.shiftKey ? -1 : 1, total)
      }
    }

    document.addEventListener(KEYDOWN_EVENT, handleKeyDown)
    return () => document.removeEventListener(KEYDOWN_EVENT, handleKeyDown)
  })
}
