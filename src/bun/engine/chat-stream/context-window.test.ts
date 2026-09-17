import { describe, expect, test } from 'bun:test'
import {
  type MessageDTO,
  type MessagePart,
  MessageRole,
  PartKind,
} from '@shared/schemas/message.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'
import {
  DEFAULT_COMPACTION_RATIO,
  estimateContextTokens,
  exceedsCompactionThreshold,
} from './context-window'

function msg(over: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: 'm1',
    chatId: 'c1',
    role: MessageRole.enum.user,
    parts: [],
    modelId: null,
    usage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

function textPart(text: string): MessagePart {
  return { type: PartKind.enum.text, text }
}

function reasoningPart(text: string): MessagePart {
  return { type: PartKind.enum.reasoning, text }
}

// exceedsCompactionThreshold only reads capabilities.contextWindow, so stub that
// one field instead of a full ModelDTO. Cast is safe: test fixture, not a boundary.
function modelWithWindow(contextWindow?: number): ModelDTO {
  return { capabilities: { contextWindow } } as ModelDTO
}

describe('estimateContextTokens', () => {
  test('empty history is zero', () => {
    expect(estimateContextTokens([])).toBe(0)
  })

  test('char heuristic rounds up at 4 chars per token', () => {
    // 10 chars / 4 = 2.5, ceil to 3.
    expect(estimateContextTokens([msg({ parts: [textPart('a'.repeat(10))] })])).toBe(3)
  })

  test('sums across every message and text part', () => {
    const history = [
      msg({ parts: [textPart('ab'), textPart('cd')] }),
      msg({ parts: [textPart('ef')] }),
    ]
    // 6 chars / 4 = 1.5, ceil to 2.
    expect(estimateContextTokens(history)).toBe(2)
  })

  test('tool-call and other bodyless parts do not count toward the estimate', () => {
    const history = [
      msg({
        parts: [
          { type: PartKind.enum['tool-call'], toolCallId: 't1', toolName: 'search', input: {} },
          textPart('abcd'),
        ],
      }),
    ]
    // Only the 4 text chars count: ceil(4 / 4) = 1.
    expect(estimateContextTokens(history)).toBe(1)
  })

  test('reasoning parts count, since toCoreMessages resends them in the payload', () => {
    const history = [
      msg({ role: MessageRole.enum.assistant, usage: null, parts: [reasoningPart('a'.repeat(4))] }),
    ]
    // Reasoning is folded back into the provider payload, so its chars must count:
    // ceil(4 / 4) = 1. Before the fix, reasoning was skipped and this returned 0.
    expect(estimateContextTokens(history)).toBe(1)
  })

  test('sums reasoning and text chars together', () => {
    const history = [
      msg({
        role: MessageRole.enum.assistant,
        usage: null,
        parts: [reasoningPart('ab'), textPart('cdef')],
      }),
    ]
    // 2 reasoning + 4 text = 6 chars, ceil(6 / 4) = 2.
    expect(estimateContextTokens(history)).toBe(2)
  })

  test('prefers the last assistant provider usage over the char heuristic', () => {
    const history = [
      msg({ role: MessageRole.enum.user, parts: [textPart('x'.repeat(4000))] }),
      msg({ role: MessageRole.enum.assistant, usage: { inputTokens: 500, outputTokens: 10 } }),
    ]
    // 4000 chars would heuristic to 1000, but the reported input count wins.
    expect(estimateContextTokens(history)).toBe(500)
  })

  test('uses the last assistant usage when several report', () => {
    const history = [
      msg({ role: MessageRole.enum.assistant, usage: { inputTokens: 100, outputTokens: 0 } }),
      msg({ role: MessageRole.enum.assistant, usage: { inputTokens: 700, outputTokens: 0 } }),
    ]
    expect(estimateContextTokens(history)).toBe(700)
  })

  test('assistant turns with null usage fall back to the char heuristic', () => {
    const history = [
      msg({ role: MessageRole.enum.assistant, usage: null, parts: [textPart('abcd')] }),
    ]
    expect(estimateContextTokens(history)).toBe(1)
  })

  test('only assistant usage counts, a user turn usage is ignored', () => {
    const history = [
      msg({
        role: MessageRole.enum.user,
        usage: { inputTokens: 999, outputTokens: 0 },
        parts: [textPart('abcd')],
      }),
    ]
    // No assistant turn reported usage, so the char heuristic runs: ceil(4 / 4) = 1.
    expect(estimateContextTokens(history)).toBe(1)
  })
})

describe('exceedsCompactionThreshold', () => {
  test('false below the threshold', () => {
    // 1000 * 0.8 = 800.
    expect(exceedsCompactionThreshold(100, modelWithWindow(1000))).toBe(false)
  })

  test('true above the threshold', () => {
    expect(exceedsCompactionThreshold(900, modelWithWindow(1000))).toBe(true)
  })

  test('the boundary is exclusive, exactly at threshold is not exceeded', () => {
    expect(exceedsCompactionThreshold(800, modelWithWindow(1000))).toBe(false)
  })

  test('falls back to a 200k window when the model reports none', () => {
    // 200_000 * 0.8 = 160_000.
    expect(exceedsCompactionThreshold(160_001, modelWithWindow(undefined))).toBe(true)
    expect(exceedsCompactionThreshold(160_000, modelWithWindow(undefined))).toBe(false)
  })

  test('honors an explicit ratio over the default', () => {
    // 1000 * 0.4 = 400, 1000 * 0.6 = 600.
    expect(exceedsCompactionThreshold(500, modelWithWindow(1000), 0.4)).toBe(true)
    expect(exceedsCompactionThreshold(500, modelWithWindow(1000), 0.6)).toBe(false)
  })

  test('default compaction ratio is 0.8', () => {
    expect(DEFAULT_COMPACTION_RATIO).toBe(0.8)
  })
})
