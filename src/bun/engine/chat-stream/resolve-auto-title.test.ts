import { describe, expect, test } from 'bun:test'
import { type ChatDTO, DEFAULT_CHAT_TITLE } from '../../../shared-contracts/schemas/chat.schema'
import {
  type MessageDTO,
  MessageRole,
  PartKind,
} from '../../../shared-contracts/schemas/message.schema'
import { resolveAutoTitle } from './resolve-auto-title'

// Minimal fixtures: resolveAutoTitle only reads chat.title and message role/parts.
function chatWith(title: string): ChatDTO {
  return { title } as ChatDTO
}
function userMsg(...texts: string[]): MessageDTO {
  return {
    role: MessageRole.enum.user,
    parts: texts.map((text) => ({ type: PartKind.enum.text, text })),
  } as MessageDTO
}
function assistantMsg(text: string): MessageDTO {
  return {
    role: MessageRole.enum.assistant,
    parts: [{ type: PartKind.enum.text, text }],
  } as MessageDTO
}

describe('resolveAutoTitle', () => {
  test('returns the first user message text when the chat is still unnamed', () => {
    const history = [userMsg('How do I center a div?'), assistantMsg('Use flexbox.')]
    expect(resolveAutoTitle(chatWith(DEFAULT_CHAT_TITLE), history)).toBe('How do I center a div?')
  })

  test('returns null when the chat already has a non-default title', () => {
    const history = [userMsg('How do I center a div?'), assistantMsg('Use flexbox.')]
    expect(resolveAutoTitle(chatWith('CSS layout help'), history)).toBeNull()
  })

  test('titles from the first user message even on a later turn (per-turn retry)', () => {
    const history = [
      userMsg('First question'),
      assistantMsg('First answer'),
      userMsg('Second question'),
      assistantMsg('Second answer'),
    ]
    expect(resolveAutoTitle(chatWith(DEFAULT_CHAT_TITLE), history)).toBe('First question')
  })

  test('joins multiple text parts of the first user message', () => {
    const history = [userMsg('part one', 'part two'), assistantMsg('ok')]
    expect(resolveAutoTitle(chatWith(DEFAULT_CHAT_TITLE), history)).toBe('part one part two')
  })

  test('returns null when there is no user message yet', () => {
    expect(resolveAutoTitle(chatWith(DEFAULT_CHAT_TITLE), [])).toBeNull()
  })

  test('returns null when the first user message has no text (attachment only)', () => {
    const imageOnly = {
      role: MessageRole.enum.user,
      parts: [{ type: PartKind.enum.image, attachmentId: 'a1' }],
    } as MessageDTO
    expect(resolveAutoTitle(chatWith(DEFAULT_CHAT_TITLE), [imageOnly])).toBeNull()
  })

  test('returns null when the chat is missing', () => {
    const history = [userMsg('anything')]
    expect(resolveAutoTitle(undefined, history)).toBeNull()
  })
})
