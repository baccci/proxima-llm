import type { MessageDTO } from '../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../shared-contracts/schemas/model.schema';

const DEFAULT_CONTEXT_WINDOW = 200_000;
export const DEFAULT_COMPACTION_RATIO = 0.8;
// Rough fallback when no provider token count is available: ~4 chars per token.
const CHARS_PER_TOKEN = 4;

// Estimate how many tokens the chat currently occupies. Prefer the last
// assistant turn's provider-reported input count (authoritative); fall back to a
// char/4 heuristic over all text parts when no turn has reported usage yet.
export function estimateContextTokens(history: MessageDTO[]): number {
  const lastAssistant = [...history]
    .reverse()
    .find((m) => m.role === 'assistant' && m.usage != null);
  if (lastAssistant?.usage?.inputTokens != null) {
    return lastAssistant.usage.inputTokens;
  }

  const chars = history.reduce((acc, m) => {
    for (const p of m.parts) {
      if (p.type === 'text') {
        acc += p.text.length;
      }
    }
    return acc;
  }, 0);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

// Whether the estimated context has crossed the compaction threshold for this
// model (a fraction of its context window).
export function exceedsCompactionThreshold(
  tokens: number,
  model: ModelDTO,
  ratio: number = DEFAULT_COMPACTION_RATIO,
): boolean {
  const window = model.capabilities.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  return tokens > window * ratio;
}
