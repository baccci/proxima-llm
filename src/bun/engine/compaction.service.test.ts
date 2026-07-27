import { describe, expect, test } from 'bun:test'
import { type MessageDTO, MessageRole } from '../../shared-contracts/schemas/message.schema'
import { selectCompaction } from './compaction-selection'

function msg(id: string, createdAt: string): MessageDTO {
  return {
    id,
    chatId: 'c1',
    role: MessageRole.enum.user,
    parts: [],
    modelId: null,
    usage: null,
    createdAt,
  }
}

const ids = (messages: MessageDTO[]) => messages.map((m) => m.id)

// Seconds :01.. :05 for a simple ascending timeline.
const timeline = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) =>
  msg(id, `2026-01-01T00:00:0${i + 1}.000Z`),
)

describe('selectCompaction', () => {
  test('keep>0 summarizes all but the recent window', () => {
    const selection = selectCompaction(timeline, undefined, 2)
    expect(selection).not.toBeNull()
    expect(ids(selection!.toSummarize)).toEqual(['m1', 'm2', 'm3'])
    expect(selection!.boundary.id).toBe('m3')
    expect(selection!.displayBoundary.id).toBe('m5')
  })

  test('keep=0 summarizes everything (guards the slice(0,-0) footgun)', () => {
    const all = timeline.slice(0, 3)
    const selection = selectCompaction(all, undefined, 0)
    expect(ids(selection!.toSummarize)).toEqual(['m1', 'm2', 'm3'])
    expect(selection!.boundary.id).toBe('m3')
    expect(selection!.displayBoundary.id).toBe('m3')
  })

  test('returns null when there is nothing older than the recent window', () => {
    // keep larger than history, keep equal to history, and empty history all summarize nothing.
    expect(selectCompaction(timeline.slice(0, 2), undefined, 5)).toBeNull()
    expect(selectCompaction(timeline.slice(0, 3), undefined, 3)).toBeNull()
    expect(selectCompaction([], undefined, 0)).toBeNull()
  })

  test('a previous snapshot drops messages at or before its boundary (exclusive)', () => {
    const all = [
      msg('old', '2026-01-01T00:00:05.000Z'),
      msg('edge', '2026-01-01T00:00:10.000Z'),
      msg('new', '2026-01-01T00:00:20.000Z'),
    ]
    const selection = selectCompaction(all, '2026-01-01T00:00:10.000Z', 0)
    expect(ids(selection!.toSummarize)).toEqual(['new'])
    expect(selection!.boundary.id).toBe('new')
    expect(selection!.displayBoundary.id).toBe('new')
  })

  test('displayBoundary is the chat tail, not the last summarized message', () => {
    const all = [
      msg('m1', '2026-01-01T00:00:05.000Z'),
      msg('m2', '2026-01-01T00:00:10.000Z'),
      msg('m3', '2026-01-01T00:00:20.000Z'),
      msg('m4', '2026-01-01T00:00:30.000Z'),
    ]
    // since = m2,m3,m4 (newer than 05); keep 1 trims m4 off the summarized set.
    const selection = selectCompaction(all, '2026-01-01T00:00:05.000Z', 1)
    expect(ids(selection!.toSummarize)).toEqual(['m2', 'm3'])
    expect(selection!.boundary.id).toBe('m3')
    expect(selection!.displayBoundary.id).toBe('m4')
  })
})
