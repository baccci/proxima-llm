export const queryKeys = {
  models: () => ['models'] as const,
  projects: () => ['projects'] as const,
  chats: (projectId: string | null) => ['chats', projectId] as const,
  messages: (chatId: string) => ['messages', chatId] as const,
  settings: () => ['settings'] as const,
  apiKey: (provider: string) => ['apiKey', provider] as const,
  toolPolicies: () => ['toolPolicies'] as const,
  controlTokens: () => ['controlTokens'] as const,
  modelSyncInfo: () => ['modelSyncInfo'] as const,
}
