import { describe, expect, test } from 'bun:test'
import type { AttachmentKind } from '../../../shared-contracts/schemas/attachment.schema'
import {
  type MessageDTO,
  type MessagePart,
  MessageRole,
  PartKind,
} from '../../../shared-contracts/schemas/message.schema'
import type { CompactionSnapshot } from '../../features/compaction/compaction.repository'
import { type ResolveAttachment, toCoreMessages } from './build-prompt'

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

const text = (t: string): MessagePart => ({ type: PartKind.enum.text, text: t })
const reasoning = (t: string): MessagePart => ({ type: PartKind.enum.reasoning, text: t })
const image = (attachmentId: string): MessagePart => ({ type: PartKind.enum.image, attachmentId })
const file = (attachmentId: string, mediaType: string): MessagePart => ({
  type: PartKind.enum.file,
  attachmentId,
  mediaType,
})
const toolCall = (toolCallId: string, toolName: string, input: unknown): MessagePart => ({
  type: PartKind.enum['tool-call'],
  toolCallId,
  toolName,
  input,
})
const toolResult = (toolCallId: string, toolName: string, output: unknown): MessagePart => ({
  type: PartKind.enum['tool-result'],
  toolCallId,
  toolName,
  output,
})

const noAttachments: ResolveAttachment = () => undefined

describe('toCoreMessages', () => {
  test('drops system messages', () => {
    const history = [msg({ role: MessageRole.enum.system, parts: [text('you are a bot')] })]
    expect(toCoreMessages(history, noAttachments)).toEqual([])
  })

  test('maps a user text message', () => {
    const history = [msg({ role: MessageRole.enum.user, parts: [text('hi')] })]
    expect(toCoreMessages(history, noAttachments)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ])
  })

  test('resolves user image and file attachments to bytes', () => {
    // kind is unused by the mapper, so any valid value works.
    const resolve: ResolveAttachment = (id) => {
      if (id === 'a1') {
        return { dataBase64: 'IMG', mediaType: 'image/png', kind: 'image' as AttachmentKind }
      }
      if (id === 'a2') {
        return { dataBase64: 'PDF', mediaType: 'application/pdf', kind: 'file' as AttachmentKind }
      }
      return undefined
    }
    const history = [
      msg({ role: MessageRole.enum.user, parts: [image('a1'), file('a2', 'application/pdf')] }),
    ]
    expect(toCoreMessages(history, resolve)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', image: 'IMG', mediaType: 'image/png' },
          { type: 'file', data: 'PDF', mediaType: 'application/pdf' },
        ],
      },
    ])
  })

  test('a missing attachment becomes a placeholder text part', () => {
    const history = [msg({ role: MessageRole.enum.user, parts: [image('gone')] })]
    expect(toCoreMessages(history, noAttachments)).toEqual([
      { role: 'user', content: [{ type: 'text', text: '[missing attachment]' }] },
    ])
  })

  test('folds assistant reasoning and text into text parts', () => {
    const history = [
      msg({ role: MessageRole.enum.assistant, parts: [reasoning('thinking'), text('answer')] }),
    ]
    expect(toCoreMessages(history, noAttachments)).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'thinking' },
          { type: 'text', text: 'answer' },
        ],
      },
    ])
  })

  test('backfills a synthetic interrupted tool-result for a dangling tool-call', () => {
    const history = [
      msg({ role: MessageRole.enum.assistant, parts: [toolCall('tc1', 'search', { q: 1 })] }),
    ]
    expect(toCoreMessages(history, noAttachments)).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'tc1', toolName: 'search', input: { q: 1 } }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            toolName: 'search',
            output: { type: 'json', value: { interrupted: true } },
          },
        ],
      },
    ])
  })

  test('keeps a real tool-result and does not synthesize one', () => {
    const history = [
      msg({
        role: MessageRole.enum.assistant,
        parts: [toolCall('tc1', 'search', {}), toolResult('tc1', 'search', { hits: 3 })],
      }),
    ]
    expect(toCoreMessages(history, noAttachments)).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'tc1', toolName: 'search', input: {} }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            toolName: 'search',
            output: { type: 'json', value: { hits: 3 } },
          },
        ],
      },
    ])
  })

  test('backfills only the unmatched tool-calls in a mixed message', () => {
    const history = [
      msg({
        role: MessageRole.enum.assistant,
        parts: [
          toolCall('tc1', 'search', {}),
          toolCall('tc2', 'fetch', {}),
          toolResult('tc1', 'search', { ok: 1 }),
        ],
      }),
    ]
    const result = toCoreMessages(history, noAttachments)
    expect(result[1]).toEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tc1',
          toolName: 'search',
          output: { type: 'json', value: { ok: 1 } },
        },
        {
          type: 'tool-result',
          toolCallId: 'tc2',
          toolName: 'fetch',
          output: { type: 'json', value: { interrupted: true } },
        },
      ],
    })
  })

  test('a pure tool-result message emits only a tool message, no empty assistant', () => {
    const history = [
      msg({ role: MessageRole.enum.assistant, parts: [toolResult('tc1', 'search', { ok: 1 })] }),
    ]
    const result = toCoreMessages(history, noAttachments)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ role: 'tool' })
  })

  test('a snapshot drops messages at or before the covered boundary', () => {
    const snapshot: CompactionSnapshot = {
      coveredThroughAt: '2026-01-01T00:00:10.000Z',
      displayThroughAt: '2026-01-01T00:00:10.000Z',
      summaryText: 'earlier summary',
    }
    const history = [
      msg({ id: 'old', createdAt: '2026-01-01T00:00:05.000Z', parts: [text('old')] }),
      msg({ id: 'edge', createdAt: '2026-01-01T00:00:10.000Z', parts: [text('edge')] }),
      msg({ id: 'new', createdAt: '2026-01-01T00:00:20.000Z', parts: [text('new')] }),
    ]
    expect(toCoreMessages(history, noAttachments, snapshot)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'new' }] },
    ])
  })
})
