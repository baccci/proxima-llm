import { describe, expect, it } from 'bun:test'
import type { ChatDTO, ChatPage } from '@shared/schemas/chat.schema'
import type { InfiniteData } from '@tanstack/react-query'
import { flattenChatPages } from './flatten-chat-pages'

function chat(id: string): ChatDTO {
  return {
    id,
    projectId: null,
    title: id,
    pinned: false,
    modelId: null,
    composer: { thinking: false, webSearch: false, effort: null, toolGrants: {} },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastMessageAt: '2026-01-01T00:00:00.000Z',
  }
}

// Build an InfiniteData whose pages hold the given id groups, in order.
function pagesOf(...groups: string[][]): InfiniteData<ChatPage> {
  return {
    pages: groups.map((ids) => ({ items: ids.map(chat), nextCursor: null })),
    pageParams: [],
  }
}

describe('flattenChatPages', () => {
  it('returns an empty array for undefined data', () => {
    expect(flattenChatPages(undefined)).toEqual([])
  })

  it('concatenates pages in order', () => {
    const flat = flattenChatPages(pagesOf(['a', 'b'], ['c', 'd']))
    expect(flat.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('dedupes by id, keeping the first occurrence and its order', () => {
    const flat = flattenChatPages(pagesOf(['a', 'b'], ['b', 'c']))
    expect(flat.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
})
