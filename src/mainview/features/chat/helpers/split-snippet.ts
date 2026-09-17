import { SNIPPET_MARK_CLOSE, SNIPPET_MARK_OPEN } from '@shared/schemas/chat-search.schema'

export type SnippetSegment = {
  text: string
  matched: boolean
}

// Break a search snippet into plain and matched runs. The database wraps each matched
// term in two control characters rather than markup, so the renderer styles the matches
// as real elements and never puts a server-built string into the DOM.
export function splitSnippet(snippet: string): SnippetSegment[] {
  const [leading, ...rest] = snippet.split(SNIPPET_MARK_OPEN)
  const segments: SnippetSegment[] = leading ? [{ text: leading, matched: false }] : []

  for (const chunk of rest) {
    const closeAt = chunk.indexOf(SNIPPET_MARK_CLOSE)

    // An opening mark with no closing one cannot come from the database. Treat the rest
    // as plain text rather than dropping it.
    if (closeAt === -1) {
      segments.push({ text: chunk, matched: false })
      continue
    }

    segments.push({ text: chunk.slice(0, closeAt), matched: true })

    const trailing = chunk.slice(closeAt + SNIPPET_MARK_CLOSE.length)
    if (trailing) {
      segments.push({ text: trailing, matched: false })
    }
  }

  return segments
}
