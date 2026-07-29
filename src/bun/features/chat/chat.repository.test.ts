import { Database } from 'bun:sqlite'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
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
const { chats, projects } = schema

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
