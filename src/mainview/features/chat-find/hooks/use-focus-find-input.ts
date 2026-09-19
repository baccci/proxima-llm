import React from 'react'
import { useChatFindStore } from '@/features/chat-find/store/chat-find.store'

/**
 * Puts the caret in the find field and selects what is already there, on open and on every
 * later Cmd+F. Pressing the shortcut while the bar is open has to re-select the query the
 * way a browser find bar does, and the store's nonce is what makes a repeated press visible
 * from here.
 *
 * A recurring imperative DOM effect, quarantined in a named hook per
 * docs/conventions/react.md: it drives focus, which React does not model as state.
 */
export function useFocusFindInput(inputRef: React.RefObject<HTMLInputElement | null>): void {
  const focusRequestId = useChatFindStore((s) => s.focusRequestId)

  // biome-ignore lint/correctness/useExhaustiveDependencies: the nonce is the trigger; inputRef is stable
  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusRequestId])
}
