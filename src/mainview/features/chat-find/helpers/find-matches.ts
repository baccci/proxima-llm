import { type MessageDTO, PartKind } from '@shared/schemas/message.schema'
import { FIND_MIN_QUERY_LENGTH } from '@/features/chat-find/constants'
import type { FindMatch } from '@/features/chat-find/entities/find-match'

// Every occurrence of `query` across a chat's messages, in reading order.
//
// Only text parts are scanned. Fenced code lives inside them, so code is searched for
// free; reasoning traces and tool-call payloads are deliberately out of scope, because
// both render collapsed and a match inside one could be counted but never shown.
//
// Matching is case-insensitive and literal, never a regex: a query is something the user
// typed into a find bar, so `(` has to mean a parenthesis.
export function findMatches(messages: MessageDTO[], query: string): FindMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < FIND_MIN_QUERY_LENGTH) {
    return []
  }

  const matches: FindMatch[] = []

  messages.forEach((message, messageIndex) => {
    // Offsets run across the message's text parts as if they were one string, so a
    // multi-part message still yields one ascending sequence.
    let partStart = 0

    for (const part of message.parts) {
      if (part.type !== PartKind.enum.text) {
        continue
      }

      const haystack = part.text.toLowerCase()
      let at = haystack.indexOf(needle)

      while (at !== -1) {
        matches.push({ messageId: message.id, messageIndex, offset: partStart + at })
        // Step past the whole match rather than one character, so "aa" in "aaaa" counts
        // twice the way a reader would count it, not three times.
        at = haystack.indexOf(needle, at + needle.length)
      }

      partStart += part.text.length
    }
  })

  return matches
}

// Global index of the first match inside each message, keyed by message id. The painter
// mounts one row at a time and needs to know which slice of the global sequence that
// row's occurrences occupy, so it can tell the active match from the rest.
export function firstMatchIndexByMessage(matches: FindMatch[]): Map<string, number> {
  const firstIndex = new Map<string, number>()

  matches.forEach((match, index) => {
    if (!firstIndex.has(match.messageId)) {
      firstIndex.set(match.messageId, index)
    }
  })

  return firstIndex
}
