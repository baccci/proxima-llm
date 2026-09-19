import type { MessageDTO } from '@shared/schemas/message.schema'
import React from 'react'
import type { FindMatch } from '@/features/chat-find/entities/find-match'
import { findMatches } from '@/features/chat-find/helpers/find-matches'
import { useChatFindStore } from '@/features/chat-find/store/chat-find.store'

export type FindResults = {
  matches: FindMatch[]
  // The query the matches were actually computed for. It lags the field while the user is
  // typing, so the painter has to highlight this rather than the live query, or the ranges
  // it paints would disagree with the count sitting beside them.
  needle: string
  // Which match is current, clamped here so every reader agrees. The stored index can
  // outlive the list it points into, because the list shrinks as the query narrows.
  activeIndex: number
}

// Everything derived from the find query for the open chat. Computed while rendering
// rather than stored: it is a pure function of the messages and the query, and
// `useMessages` keeps the whole chat in the query cache, so there is nothing to fetch and
// nothing to keep in sync.
export function useFindMatches(messages: MessageDTO[]): FindResults {
  const isOpen = useChatFindStore((s) => s.isOpen)
  const query = useChatFindStore((s) => s.query)
  const storedIndex = useChatFindStore((s) => s.activeIndex)

  // Defer the query the scan runs on, so typing stays responsive and a burst of keystrokes
  // coalesces into one pass over the chat instead of one per character. The same trick the
  // search palette uses, minus the round trip.
  const deferredQuery = React.useDeferredValue(query)
  const needle = isOpen ? deferredQuery.trim().toLowerCase() : ''

  const matches = React.useMemo(
    () => (isOpen ? findMatches(messages, deferredQuery) : []),
    [messages, deferredQuery, isOpen],
  )

  return {
    matches,
    needle,
    activeIndex: Math.min(storedIndex, Math.max(0, matches.length - 1)),
  }
}
