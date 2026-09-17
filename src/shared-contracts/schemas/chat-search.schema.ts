import { z } from 'zod'

// Sentinels wrapping each matched term inside a snippet. Control characters, so they can
// never collide with real message text, and the renderer splits the string on them
// instead of parsing markup into the DOM.
export const SNIPPET_MARK_OPEN = '\u0002'
export const SNIPPET_MARK_CLOSE = '\u0003'

// What the query matched on. A title hit has no message to land on, a content hit does.
// Compare with SearchHitKind.enum.title, never a bare string.
export const SearchHitKind = z.enum(['title', 'content'])
export type SearchHitKind = z.infer<typeof SearchHitKind>

export const ChatSearchHit = z.object({
  chatId: z.string(),
  projectId: z.string().nullable(),
  title: z.string(),
  kind: SearchHitKind,
  // The message the snippet came from, so opening the hit can land on it. Null for a
  // title hit, which matched the chat itself rather than anything said in it.
  messageId: z.string().nullable(),
  // Excerpt around the match, with every matched term wrapped in the sentinels above.
  snippet: z.string(),
  lastMessageAt: z.string().datetime(),
})

export type ChatSearchHit = z.infer<typeof ChatSearchHit>

export const SearchChatsInput = z.object({
  query: z.string(),
  // Null searches every chat, a real id scopes the search to that project.
  projectId: z.string().nullable(),
  limit: z.number().int().positive(),
})

export type SearchChatsInput = z.infer<typeof SearchChatsInput>
