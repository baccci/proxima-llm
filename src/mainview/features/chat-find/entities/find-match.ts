// One occurrence of the find query inside a chat's messages.
//
// The list of these is built from the message data, not from the DOM, because the message
// list is virtualized: only rows near the viewport exist, so a DOM scan would miss almost
// every match in a long chat. That makes this the source of truth for the match count and
// for next/prev ordering.
export type FindMatch = {
  messageId: string
  // Position in the chat's message array, so a jump can drive the virtualizer straight to
  // the row without searching for it again.
  messageIndex: number
  // Where the match starts in the message's concatenated text. Ordering and debugging
  // only: these are offsets into the markdown source, while highlights are painted over
  // rendered text, so the painter re-finds its own ranges. See docs/features/chat-find.md.
  offset: number
}
