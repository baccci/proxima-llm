import type { ProviderId } from '@shared/providers/registry'
import type { MemoryScope } from '@shared/schemas/memory-slice.schema'

// Marks the search subtree under ['chats']. Its rows are search hits rather than chats,
// so a cache walker that expects chat shapes has to be able to tell it apart.
export const CHAT_SEARCH_SEGMENT = 'search'

export const queryKeys = {
  models: () => ['models'] as const,
  projects: () => ['projects'] as const,
  chats: (projectId: string | null) => ['chats', projectId] as const,
  // Pinned list, nested under the project's chats so a broad ['chats'] invalidation
  // sweeps it alongside the paginated list.
  chatsPinned: (projectId: string | null) => ['chats', projectId, 'pinned'] as const,
  // A single chat, also nested under ['chats'] so the same broad invalidation keeps it
  // fresh (e.g. when an auto-title lands) without a separate invalidation path.
  chat: (id: string | null) => ['chats', 'detail', id] as const,
  // Search results, nested under ['chats'] so a chat edit sweeps stale hits too.
  chatSearch: (projectId: string | null, query: string) =>
    ['chats', CHAT_SEARCH_SEGMENT, projectId, query] as const,
  // Prefix key matching every chat list regardless of project, for broad invalidation.
  chatsAll: () => ['chats'] as const,
  messages: (chatId: string) => ['messages', chatId] as const,
  compaction: (chatId: string) => ['compaction', chatId] as const,
  settings: () => ['settings'] as const,
  apiKey: (provider: ProviderId) => ['apiKey', provider] as const,
  toolPolicies: () => ['toolPolicies'] as const,
  hooks: () => ['hooks'] as const,
  controlTokens: () => ['controlTokens'] as const,
  modelSyncInfo: () => ['modelSyncInfo'] as const,
  memorySlices: (scope: MemoryScope, projectId: string | null) =>
    ['memory-slices', scope, projectId] as const,
  memorySummary: (projectId: string) => ['memory-summary', projectId] as const,
  projectFiles: (projectId: string) => ['project-files', projectId] as const,
  logInfo: () => ['logInfo'] as const,
  // Client-side Shiki highlight cache, keyed by content (pure compute, never invalidated).
  highlight: (lang: string, code: string) => ['highlight', lang, code] as const,
}
