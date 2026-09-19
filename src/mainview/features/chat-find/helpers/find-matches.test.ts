import { describe, expect, test } from 'bun:test'
import { type MessageDTO, MessageRole, PartKind } from '@shared/schemas/message.schema'
import { findMatches, firstMatchIndexByMessage } from './find-matches'

function message(id: string, ...texts: string[]): MessageDTO {
  return {
    id,
    chatId: 'chat-1',
    role: MessageRole.enum.assistant,
    parts: texts.map((text) => ({ type: PartKind.enum.text, text })),
    modelId: null,
    usage: null,
    createdAt: '2026-09-17T00:00:00.000Z',
  }
}

describe('findMatches', () => {
  test('a query shorter than the minimum finds nothing', () => {
    expect(findMatches([message('m1', 'a keychain')], 'k')).toEqual([])
  })

  test('finds a single match and reports where it sits', () => {
    expect(findMatches([message('m1', 'port the keychain')], 'keychain')).toEqual([
      { messageId: 'm1', messageIndex: 0, offset: 9 },
    ])
  })

  test('matches case-insensitively', () => {
    expect(findMatches([message('m1', 'The Keychain')], 'keychain')).toHaveLength(1)
  })

  test('treats the query literally, not as a regex', () => {
    expect(findMatches([message('m1', 'call foo(bar)')], 'foo(')).toHaveLength(1)
    expect(findMatches([message('m1', 'call foo(bar)')], 'f.o')).toHaveLength(0)
  })

  test('steps past a whole match, so "aa" in "aaaa" counts twice', () => {
    expect(findMatches([message('m1', 'aaaa')], 'aa').map((m) => m.offset)).toEqual([0, 2])
  })

  test('offsets run across a message text parts as one string', () => {
    const matches = findMatches([message('m1', 'first hit', ' second hit')], 'hit')
    expect(matches.map((m) => m.offset)).toEqual([6, 17])
  })

  test('returns matches in reading order across messages', () => {
    const matches = findMatches([message('m1', 'hit one'), message('m2', 'hit two')], 'hit')
    expect(matches.map((m) => [m.messageId, m.messageIndex])).toEqual([
      ['m1', 0],
      ['m2', 1],
    ])
  })

  test('finds text inside a fenced code block', () => {
    const fenced = message('m1', 'here:\n```ts\nconst keychain = 1\n```')
    expect(findMatches([fenced], 'keychain')).toHaveLength(1)
  })

  test('ignores reasoning and tool parts, which render collapsed', () => {
    const mixed: MessageDTO = {
      ...message('m1', 'visible keychain'),
      parts: [
        { type: PartKind.enum.reasoning, text: 'hidden keychain' },
        { type: PartKind.enum.text, text: 'visible keychain' },
        { type: PartKind.enum['tool-call'], toolCallId: 't1', toolName: 'bash', input: 'keychain' },
      ],
    }
    expect(findMatches([mixed], 'keychain')).toEqual([
      { messageId: 'm1', messageIndex: 0, offset: 8 },
    ])
  })

  test('a query that matches nothing yields an empty list', () => {
    expect(findMatches([message('m1', 'nothing here')], 'keychain')).toEqual([])
  })
})

describe('firstMatchIndexByMessage', () => {
  test('maps each message to the global index of its first match', () => {
    const matches = findMatches([message('m1', 'hit hit'), message('m2', 'hit')], 'hit')
    expect(firstMatchIndexByMessage(matches)).toEqual(
      new Map([
        ['m1', 0],
        ['m2', 2],
      ]),
    )
  })

  test('an empty match list maps nothing', () => {
    expect(firstMatchIndexByMessage([])).toEqual(new Map())
  })
})
