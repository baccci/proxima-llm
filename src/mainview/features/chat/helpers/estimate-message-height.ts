import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import { isSilentTool } from '@shared/tools/tool-catalog'

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
// Chrome a fenced code block adds around its lines: the language header, the padding
// inside the card, and its border.
const CODE_BLOCK_CHROME_HEIGHT = 48
// A collapsed tool-call card, which is a single header row inside a bordered box.
const TOOL_CALL_HEIGHT = 40
// One entry in the sources strip under a message that cited the web.
const SOURCE_HEIGHT = 10

// Opening or closing fence of a code block. Pairs of these bracket one block.
const CODE_FENCE_PATTERN = /^```/gm

// Fences come in pairs, so two of them bracket one block. An unclosed fence rounds
// down, which only costs us a slightly short estimate.
function codeBlockCount(value: string): number {
  return Math.floor((value.match(CODE_FENCE_PATTERN)?.length ?? 0) / 2)
}

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
      height += codeBlockCount(part.text) * CODE_BLOCK_CHROME_HEIGHT
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
      continue
    }

    // Silent tools render nothing, so counting them would push every row below this
    // message too far down. See message-part-renderer.
    if (part.type === PartKind.enum['tool-call'] || part.type === PartKind.enum['tool-result']) {
      if (!isSilentTool(part.toolName)) {
        height += TOOL_CALL_HEIGHT
      }
      continue
    }

    if (part.type === PartKind.enum.source) {
      height += SOURCE_HEIGHT
    }
  }

  return height
}
