import { describe, expect, test } from 'bun:test'
import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import { estimateMessageHeight } from './estimate-message-height'

// Real catalog entries: read_memory is flagged silent, write_memory is not.
const SILENT_TOOL = 'read_memory'
const RENDERED_TOOL = 'write_memory'

function text(value: string): MessagePart {
  return { type: PartKind.enum.text, text: value }
}

describe('estimateMessageHeight', () => {
  test('a short one-line message is near the base height', () => {
    const height = estimateMessageHeight([text('hi there')])
    expect(height).toBeGreaterThan(0)
    expect(height).toBeLessThan(120)
  })

  test('a longer message estimates taller than a short one', () => {
    const short = estimateMessageHeight([text('short')])
    const long = estimateMessageHeight([text('word '.repeat(400))])
    expect(long).toBeGreaterThan(short)
  })

  test('explicit newlines each count as at least one line', () => {
    const oneLine = estimateMessageHeight([text('a')])
    const fiveLines = estimateMessageHeight([text('a\nb\nc\nd\ne')])
    expect(fiveLines).toBeGreaterThan(oneLine)
  })

  test('an image part adds a thumbnail-sized block', () => {
    const withImage = estimateMessageHeight([{ type: PartKind.enum.image, attachmentId: 'a1' }])
    const textOnly = estimateMessageHeight([text('a')])
    expect(withImage).toBeGreaterThan(textOnly)
  })

  test('an empty parts list still returns a positive base height', () => {
    expect(estimateMessageHeight([])).toBeGreaterThan(0)
  })

  test('a fenced code block estimates taller than the same lines as prose', () => {
    const lines = 'const a = 1\nconst b = 2\nconst c = 3'
    const prose = estimateMessageHeight([text(lines)])
    const fenced = estimateMessageHeight([text(`\`\`\`ts\n${lines}\n\`\`\``)])
    expect(fenced).toBeGreaterThan(prose)
  })

  test('a rendered tool call adds height', () => {
    const withCall = estimateMessageHeight([
      { type: PartKind.enum['tool-call'], toolCallId: 't1', toolName: RENDERED_TOOL, input: {} },
    ])
    expect(withCall).toBeGreaterThan(estimateMessageHeight([]))
  })

  test('a silent tool call adds nothing, because it renders nothing', () => {
    const silent = estimateMessageHeight([
      { type: PartKind.enum['tool-call'], toolCallId: 't1', toolName: SILENT_TOOL, input: {} },
    ])
    expect(silent).toBe(estimateMessageHeight([]))
  })
})
