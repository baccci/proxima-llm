import { describe, expect, test } from 'bun:test'
import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import { estimateMessageHeight } from './estimate-message-height'

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
})
