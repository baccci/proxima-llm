import type React from 'react'

// Decide whether a composer keydown should send the message. Enter sends; Shift+Enter
// is always a newline; when send-on-enter is off, only Cmd/Ctrl+Enter sends.
export function shouldSendOnEnter(e: React.KeyboardEvent, sendOnEnter: boolean): boolean {
  if (e.key !== 'Enter') {
    return false
  }

  return sendOnEnter ? !e.shiftKey : e.metaKey || e.ctrlKey
}
