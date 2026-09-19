// Shortest query worth finding. One character matches most of a chat and paints the whole
// screen, which tells the reader nothing and makes the "n of m" counter meaningless.
export const FIND_MIN_QUERY_LENGTH = 2

// Names the two highlight ranges are registered under in CSS.highlights. The matching
// ::highlight() rules live in global.css, so both sides have to agree on these strings.
export const FIND_HIGHLIGHT = 'proxima-find'
export const FIND_HIGHLIGHT_ACTIVE = 'proxima-find-active'

// Marks a mounted message row for the painter, which walks the rows the virtualizer has
// mounted and maps their text nodes back to messages. Set in message-list.
export const FIND_ROW_ATTRIBUTE = 'data-find-message-id'

// Marks the rendered text of one message part, which is the only thing find paints over.
// The data pass scans text parts and nothing else, so the painter has to walk exactly the
// same ground: a row also renders its thinking trace, tool payloads, sources, token counts
// and hover actions, and a stray hit in any of those would shift the numbering that tells
// the active match from the rest. Set in message-part-renderer.
export const FIND_TEXT_ATTRIBUTE = 'data-find-text'
