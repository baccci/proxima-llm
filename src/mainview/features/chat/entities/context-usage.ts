import type { MessageDTO } from '@shared/schemas/message.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'

export type ContextUsage = {
  used: number
  limit: number
  fraction: number
  cachedFraction: number
  lastTurn: NonNullable<MessageDTO['usage']>
}

export function getContextUsage(
  messages: MessageDTO[],
  model: ModelDTO | undefined,
): ContextUsage | null {
  const limit = model?.capabilities.contextWindow
  if (!limit) return null

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.usage)
  if (!lastAssistant?.usage) return null

  const u = lastAssistant.usage
  // input + cache tokens = everything that was sent in the prompt this turn (system + full history).
  // output tokens = the reply, which is now part of history. Together ≈ current window occupancy.
  const used = u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0) + u.outputTokens
  const promptTotal = u.inputTokens + (u.cacheReadTokens ?? 0) + (u.cacheWriteTokens ?? 0)
  const cachedFraction = promptTotal > 0 ? (u.cacheReadTokens ?? 0) / promptTotal : 0

  return {
    used,
    limit,
    fraction: Math.min(1, used / limit),
    cachedFraction,
    lastTurn: u,
  }
}
