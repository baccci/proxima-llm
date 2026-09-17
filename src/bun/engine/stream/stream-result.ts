import { StopReason, type TokenUsage } from '@shared/schemas/message.schema'
import type { LanguageModelUsage, ProviderMetadata } from 'ai'

// The DOMException.name the idle guard aborts with. run.ts constructs it, this
// module reads it back to tell an idle timeout apart from a user cancel.
export const IDLE_TIMEOUT_ERROR_NAME = 'TimeoutError'

// An abort surfaces two ways: as a thrown error, or as a delta.type === 'error'
// event that ends the loop normally. Both leave the signal aborted, so we read
// the reason from the signal rather than the throw site. A TimeoutError is our
// idle guard firing; anything else is the user cancelling.
export function classifyAbort(signal: AbortSignal): StopReason {
  const reason = signal.reason
  return reason instanceof DOMException && reason.name === IDLE_TIMEOUT_ERROR_NAME
    ? StopReason.enum['idle-timeout']
    : StopReason.enum['user-cancel']
}

// Pull token counts out of the provider's raw usage. Cache-token reporting is
// provider-specific: Anthropic exposes read/write in its metadata block,
// OpenRouter nests a cached-prompt count. The openrouter shape is not typed by
// the SDK, so we assert the one field we read.
export function extractUsage(
  rawUsage: LanguageModelUsage | undefined,
  meta: ProviderMetadata | undefined,
): TokenUsage | null {
  if (!rawUsage) {
    return null
  }

  const anthropicMeta = meta?.anthropic

  const cacheWriteTokens =
    typeof anthropicMeta?.cacheCreationInputTokens === 'number'
      ? anthropicMeta.cacheCreationInputTokens
      : undefined

  const anthropicCacheRead =
    typeof anthropicMeta?.cacheReadInputTokens === 'number'
      ? anthropicMeta.cacheReadInputTokens
      : undefined

  const orCachedTokens = (
    meta?.openrouter as { promptTokensDetails?: { cachedTokens?: number } } | undefined
  )?.promptTokensDetails?.cachedTokens
  const openrouterCacheRead = typeof orCachedTokens === 'number' ? orCachedTokens : undefined

  return {
    inputTokens: rawUsage.inputTokens ?? 0,
    outputTokens: rawUsage.outputTokens ?? 0,
    cacheWriteTokens,
    cacheReadTokens: anthropicCacheRead ?? openrouterCacheRead,
  }
}
