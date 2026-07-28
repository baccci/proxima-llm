import { type MessagePart, PartKind } from '@shared/schemas/message.schema'

// Rough per-message height (px) used only to seed the virtualizer before a row is
// really measured. It never needs to be exact: a closer guess just means a smaller
// jump when the row mounts and its true height is reported. See spec.md.

// Vertical margins plus one short line of text.
const BASE_HEIGHT = 44
// Approximate rendered line height at the message font size.
const PX_PER_LINE = 26
// Approximate characters that fit on one line at the content column width.
const CHARS_PER_LINE = 80
// A collapsed "Thought for Xs" reasoning toggle.
const REASONING_HEIGHT = 28
// A rendered image thumbnail block.
const IMAGE_HEIGHT = 220
// A single file chip row.
const FILE_HEIGHT = 52

function textLines(value: string): number {
  let lines = 0

  for (const line of value.split('\n')) {
    lines += Math.max(1, Math.ceil(line.length / CHARS_PER_LINE))
  }

  return lines
}

export function estimateMessageHeight(parts: MessagePart[]): number {
  let height = BASE_HEIGHT

  for (const part of parts) {
    if (part.type === PartKind.enum.text) {
      height += textLines(part.text) * PX_PER_LINE
      continue
    }

    if (part.type === PartKind.enum.reasoning) {
      height += REASONING_HEIGHT
      continue
    }

    if (part.type === PartKind.enum.image) {
      height += IMAGE_HEIGHT
      continue
    }

    if (part.type === PartKind.enum.file) {
      height += FILE_HEIGHT
    }
  }

  return height
}
