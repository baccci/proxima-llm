import type { MemoryScope } from '@shared/schemas/memory-slice.schema'

export const queryKeys = {
  models: () => ['models'] as const,
  projects: () => ['projects'] as const,
  chats: (projectId: string | null) => ['chats', projectId] as const,
  messages: (chatId: string) => ['messages', chatId] as const,
  compaction: (chatId: string) => ['compaction', chatId] as const,
  settings: () => ['settings'] as const,
  apiKey: (provider: string) => ['apiKey', provider] as const,
  toolPolicies: () => ['toolPolicies'] as const,
  controlTokens: () => ['controlTokens'] as const,
  modelSyncInfo: () => ['modelSyncInfo'] as const,
  memorySlices: (scope: MemoryScope, projectId: string | null) =>
    ['memory-slices', scope, projectId] as const,
  memorySummary: (projectId: string) => ['memory-summary', projectId] as const,
  projectFiles: (projectId: string) => ['project-files', projectId] as const,
  logInfo: () => ['logInfo'] as const,
}
