import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import {
  SearchHitKind,
  SNIPPET_MARK_CLOSE,
  SNIPPET_MARK_OPEN,
} from '../../../shared-contracts/schemas/chat-search.schema'
import {
  type MessagePart,
  MessageRole,
  PartKind,
} from '../../../shared-contracts/schemas/message.schema'
import * as schema from '../../infra/db/schema'

// Isolated in-memory DB for the repo under test. Mocking infra/db/client swaps the
// real file-backed database (and keeps electrobun's Utils.paths out of the test),
// while setupSchema builds the tables against this same connection.
const sqlite = new Database(':memory:')
sqlite.exec('PRAGMA foreign_keys=ON;')
const db = drizzle(sqlite, { schema })

mock.module('../../infra/db/client', () => ({ db, sqlite }))
// chat.repository imports the attachment repository, which loads electrobun at the
// top level. The tests never touch attachments, so a stub keeps electrobun unloaded.
mock.module('../attachment/attachment.repository', () => ({ getAttachment: () => undefined }))

const { setupSchema } = await import('../../infra/db/migrate')
setupSchema()

const repo = await import('./chat.repository')
const { chats, messages, projects } = schema

// Projects referenced by the project-scoped tests. Seeded once (beforeEach only
// clears chats) so the chats.project_id foreign key resolves.
const seedDate = new Date(Date.UTC(2026, 0, 1))
for (const id of ['A', 'B']) {
  db.insert(projects)
    .values({ id, name: `project-${id}`, createdAt: seedDate, updatedAt: seedDate })
    .run()
}

beforeEach(() => {
  sqlite.exec('DELETE FROM chats')
})

// Seed a chat with an explicit recency stamp. Everything else takes a sane default so
// each test only spells out the fields it actually asserts on.
function seedChat(over: {
  id: string
  lastMessageAt: Date
  pinned?: boolean
  projectId?: string | null
  title?: string
}): void {
  db.insert(chats)
    .values({
      id: over.id,
      projectId: over.projectId ?? null,
      title: over.title ?? `chat-${over.id}`,
      pinned: over.pinned ?? false,
      composer: { thinking: false, webSearch: false, effort: null, toolGrants: {} },
      createdAt: over.lastMessageAt,
      updatedAt: over.lastMessageAt,
      lastMessageAt: over.lastMessageAt,
    })
    .run()
}

// Descending minutes: index 0 is the newest. Handy for building an ordered run.
function minutesAgo(n: number): Date {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, 0) - n * 60_000)
}

describe('listChats pagination', () => {
  it('returns at most `limit` items and a cursor when more remain', () => {
    for (let i = 0; i < 5; i++) {
      seedChat({ id: `c${i}`, lastMessageAt: minutesAgo(i) })
    }

    const page = repo.listChats({ projectId: null, cursor: null, limit: 2 })

    expect(page.items.map((c) => c.id)).toEqual(['c0', 'c1'])
    expect(page.nextCursor).toEqual({ lastMessageAt: minutesAgo(1).getTime(), id: 'c1' })
  })

  it('walks every row exactly once across page boundaries, newest first', () => {
    for (let i = 0; i < 5; i++) {
      seedChat({ id: `c${i}`, lastMessageAt: minutesAgo(i) })
    }

    const seen: string[] = []
    let cursor = null
    for (;;) {
      const page = repo.listChats({ projectId: null, cursor, limit: 2 })
      seen.push(...page.items.map((c) => c.id))
      if (!page.nextCursor) {
        break
      }
      cursor = page.nextCursor
    }

    expect(seen).toEqual(['c0', 'c1', 'c2', 'c3', 'c4'])
  })

  it('reports nextCursor null on the last page (exact multiple of limit)', () => {
    for (let i = 0; i < 4; i++) {
      seedChat({ id: `c${i}`, lastMessageAt: minutesAgo(i) })
    }

    const first = repo.listChats({ projectId: null, cursor: null, limit: 2 })
    const second = repo.listChats({ projectId: null, cursor: first.nextCursor, limit: 2 })

    expect(second.items.map((c) => c.id)).toEqual(['c2', 'c3'])
    expect(second.nextCursor).toBeNull()
  })

  it('excludes pinned chats', () => {
    seedChat({ id: 'unpinned', lastMessageAt: minutesAgo(0) })
    seedChat({ id: 'pinned', lastMessageAt: minutesAgo(1), pinned: true })

    const page = repo.listChats({ projectId: null, cursor: null, limit: 10 })

    expect(page.items.map((c) => c.id)).toEqual(['unpinned'])
  })

  it('filters by projectId, and null means every project', () => {
    seedChat({ id: 'in-a', lastMessageAt: minutesAgo(0), projectId: 'A' })
    seedChat({ id: 'in-b', lastMessageAt: minutesAgo(1), projectId: 'B' })
    seedChat({ id: 'loose', lastMessageAt: minutesAgo(2), projectId: null })

    const scoped = repo.listChats({ projectId: 'A', cursor: null, limit: 10 })
    expect(scoped.items.map((c) => c.id)).toEqual(['in-a'])

    const all = repo.listChats({ projectId: null, cursor: null, limit: 10 })
    expect(all.items.map((c) => c.id)).toEqual(['in-a', 'in-b', 'loose'])
  })

  it('breaks equal-lastMessageAt ties by id (desc) with no skips or repeats', () => {
    const ts = minutesAgo(0)
    for (const id of ['a', 'b', 'c']) {
      seedChat({ id, lastMessageAt: ts })
    }

    const first = repo.listChats({ projectId: null, cursor: null, limit: 2 })
    expect(first.items.map((c) => c.id)).toEqual(['c', 'b'])

    const second = repo.listChats({ projectId: null, cursor: first.nextCursor, limit: 2 })
    expect(second.items.map((c) => c.id)).toEqual(['a'])
    expect(second.nextCursor).toBeNull()
  })
})

describe('listPinnedChats', () => {
  it('returns only pinned chats, newest first, and respects the project scope', () => {
    seedChat({ id: 'p-new', lastMessageAt: minutesAgo(0), pinned: true, projectId: 'A' })
    seedChat({ id: 'p-old', lastMessageAt: minutesAgo(2), pinned: true, projectId: 'A' })
    seedChat({ id: 'p-other', lastMessageAt: minutesAgo(1), pinned: true, projectId: 'B' })
    seedChat({ id: 'unpinned', lastMessageAt: minutesAgo(0), pinned: false, projectId: 'A' })

    expect(repo.listPinnedChats({ projectId: 'A' }).map((c) => c.id)).toEqual(['p-new', 'p-old'])
    expect(repo.listPinnedChats({ projectId: null }).map((c) => c.id)).toEqual([
      'p-new',
      'p-other',
      'p-old',
    ])
  })
})

describe('getChat', () => {
  it('returns the chat DTO when it exists', () => {
    seedChat({ id: 'here', lastMessageAt: minutesAgo(0), title: 'Found me' })
    expect(repo.getChat('here')?.title).toBe('Found me')
  })

  it('returns undefined for an unknown id', () => {
    expect(repo.getChat('missing')).toBeUndefined()
  })
})

// Seed one message with the given parts. The FTS triggers index it on insert, so these
// tests exercise the real index rather than a hand-populated one.
function seedMessage(over: { id: string; chatId: string; parts: MessagePart[] }): void {
  db.insert(messages)
    .values({
      id: over.id,
      chatId: over.chatId,
      role: MessageRole.enum.user,
      parts: over.parts,
      createdAt: seedDate,
    })
    .run()
}

function textPart(text: string): MessagePart {
  return { type: PartKind.enum.text, text }
}

// Strip the snippet sentinels back out, so an assertion can read the plain excerpt.
function plainSnippet(snippet: string): string {
  return snippet.split(SNIPPET_MARK_OPEN).join('').split(SNIPPET_MARK_CLOSE).join('')
}

describe('searchChats', () => {
  it('finds a chat by its title and reports no message to land on', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Keychain port notes' })

    const hits = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(hits).toHaveLength(1)
    expect(hits[0].chatId).toBe('c1')
    expect(hits[0].kind).toBe(SearchHitKind.enum.title)
    expect(hits[0].messageId).toBeNull()
  })

  it('finds a chat by message text and points at the matching message', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('nothing relevant here')] })
    seedMessage({ id: 'm2', chatId: 'c1', parts: [textPart('we should port the keychain FFI')] })

    const hits = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe(SearchHitKind.enum.content)
    expect(hits[0].messageId).toBe('m2')
    expect(plainSnippet(hits[0].snippet)).toContain('keychain FFI')
  })

  it('wraps every matched term in the snippet sentinels', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('the keychain is here')] })

    const [hit] = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(hit.snippet).toContain(`${SNIPPET_MARK_OPEN}keychain${SNIPPET_MARK_CLOSE}`)
  })

  it('ranks a title hit above a content hit', () => {
    seedChat({ id: 'by-content', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'by-content', parts: [textPart('keychain keychain keychain')] })
    seedChat({ id: 'by-title', lastMessageAt: minutesAgo(5), title: 'Keychain notes' })

    const hits = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(hits.map((h) => h.chatId)).toEqual(['by-title', 'by-content'])
  })

  it('returns one row per chat even when many of its messages match', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    for (let i = 0; i < 20; i++) {
      seedMessage({ id: `m${i}`, chatId: 'c1', parts: [textPart('keychain mention')] })
    }
    seedChat({ id: 'c2', lastMessageAt: minutesAgo(1), title: 'Also untitled' })
    seedMessage({ id: 'other', chatId: 'c2', parts: [textPart('keychain here too')] })

    const hits = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(hits.map((h) => h.chatId).sort()).toEqual(['c1', 'c2'])
  })

  it('lists a chat once when both its title and its messages match', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Keychain notes' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('keychain again')] })

    const hits = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(hits).toHaveLength(1)
    expect(hits[0].kind).toBe(SearchHitKind.enum.title)
  })

  it('ignores reasoning and tool call parts', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({
      id: 'm1',
      chatId: 'c1',
      parts: [
        { type: PartKind.enum.reasoning, text: 'internal keychain deliberation' },
        { type: PartKind.enum['tool-call'], toolCallId: 't1', toolName: 'keychain', input: {} },
      ],
    })

    expect(repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })).toEqual([])
  })

  it('matches a prefix, so hits appear while the user is still typing', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('the keychain module')] })

    expect(repo.searchChats({ query: 'keych', projectId: null, limit: 10 })).toHaveLength(1)
  })

  it('folds accents, so an unaccented query finds accented text', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('tomamos un café por la mañana')] })

    expect(repo.searchChats({ query: 'cafe', projectId: null, limit: 10 })).toHaveLength(1)
  })

  it('scopes to a project when one is given', () => {
    seedChat({ id: 'in-a', lastMessageAt: minutesAgo(0), title: 'Keychain in A', projectId: 'A' })
    seedChat({ id: 'in-b', lastMessageAt: minutesAgo(1), title: 'Keychain in B', projectId: 'B' })

    const scoped = repo.searchChats({ query: 'keychain', projectId: 'A', limit: 10 })
    const global = repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })

    expect(scoped.map((h) => h.chatId)).toEqual(['in-a'])
    expect(global.map((h) => h.chatId).sort()).toEqual(['in-a', 'in-b'])
  })

  it('treats a query with no searchable characters as no results', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Keychain notes' })

    expect(repo.searchChats({ query: '   ', projectId: null, limit: 10 })).toEqual([])
    expect(repo.searchChats({ query: '?!*()"', projectId: null, limit: 10 })).toEqual([])
  })

  it('survives FTS5 operator syntax in the query instead of throwing', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Keychain notes' })

    expect(() =>
      repo.searchChats({ query: 'keychain OR (unbalanced "', projectId: null, limit: 10 }),
    ).not.toThrow()
  })

  it('requires every token to match', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('the keychain module')] })

    expect(repo.searchChats({ query: 'keychain module', projectId: null, limit: 10 })).toHaveLength(
      1,
    )
    expect(repo.searchChats({ query: 'keychain absent', projectId: null, limit: 10 })).toEqual([])
  })

  it('follows a renamed title', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled draft' })
    repo.updateChat('c1', { title: 'Keychain notes' })

    expect(repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })).toHaveLength(1)
    expect(repo.searchChats({ query: 'untitled', projectId: null, limit: 10 })).toEqual([])
  })

  it('drops messages from the index when the chat is deleted', () => {
    seedChat({ id: 'c1', lastMessageAt: minutesAgo(0), title: 'Untitled' })
    seedMessage({ id: 'm1', chatId: 'c1', parts: [textPart('keychain content')] })
    repo.deleteChat('c1')

    expect(repo.searchChats({ query: 'keychain', projectId: null, limit: 10 })).toEqual([])
  })

  it('honours the limit', () => {
    for (let i = 0; i < 6; i++) {
      seedChat({ id: `c${i}`, lastMessageAt: minutesAgo(i), title: `Keychain note ${i}` })
    }

    expect(repo.searchChats({ query: 'keychain', projectId: null, limit: 3 })).toHaveLength(3)
  })
})
