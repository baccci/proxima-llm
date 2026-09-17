import { describe, expect, test } from 'bun:test'
import { type MessageDTO, MessageRole, PartKind } from '@shared/schemas/message.schema'
import { buildCompactionPrompt } from './compaction-prompt'

function msg(role: MessageRole, parts: MessageDTO['parts']): MessageDTO {
  return {
    id: 'm1',
    chatId: 'c1',
    role,
    parts,
    modelId: null,
    usage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

const textPart = (text: string): MessageDTO['parts'][number] => ({
  type: PartKind.enum.text,
  text,
})

// The prompt filters on part.type, so a minimal non-text stub is enough here.
const reasoningPart = { type: PartKind.enum.reasoning } as MessageDTO['parts'][number]

const INSTRUCTION_PREFIX = 'Write a dense summary'

describe('buildCompactionPrompt', () => {
  test('no previous summary: only the turns header and the instruction', () => {
    const prompt = buildCompactionPrompt(undefined, [msg(MessageRole.enum.user, [textPart('hi')])])
    expect(prompt).not.toContain('## Previous conversation summary')
    expect(prompt).toContain('## Conversation turns to summarize')
    expect(prompt).toContain('User: hi')
    expect(prompt).toContain(INSTRUCTION_PREFIX)
  })

  test('previous summary is prepended under its own header', () => {
    const prompt = buildCompactionPrompt('earlier recap', [])
    const summaryAt = prompt.indexOf('## Previous conversation summary')
    const turnsAt = prompt.indexOf('## Conversation turns to summarize')
    expect(summaryAt).toBeGreaterThanOrEqual(0)
    expect(prompt).toContain('earlier recap')
    // Prior summary sits above the turns section.
    expect(summaryAt).toBeLessThan(turnsAt)
  })

  test('role maps user to User and assistant to Assistant', () => {
    const prompt = buildCompactionPrompt(undefined, [
      msg(MessageRole.enum.user, [textPart('question')]),
      msg(MessageRole.enum.assistant, [textPart('answer')]),
    ])
    expect(prompt).toContain('User: question')
    expect(prompt).toContain('Assistant: answer')
  })

  test('multiple text parts in one turn join with a space', () => {
    const prompt = buildCompactionPrompt(undefined, [
      msg(MessageRole.enum.user, [textPart('one'), textPart('two')]),
    ])
    expect(prompt).toContain('User: one two')
  })

  test('non-text parts are dropped from the turn text', () => {
    const prompt = buildCompactionPrompt(undefined, [
      msg(MessageRole.enum.assistant, [reasoningPart, textPart('visible')]),
    ])
    expect(prompt).toContain('Assistant: visible')
    expect(prompt).not.toContain('reasoning')
  })

  test('a turn with no text emits no line (no empty "User: ")', () => {
    const prompt = buildCompactionPrompt(undefined, [msg(MessageRole.enum.user, [reasoningPart])])
    expect(prompt).not.toContain('User:')
    expect(prompt).not.toContain('Assistant:')
  })
})
