import type { AnthropicFamily } from '../../../shared-contracts/models/families';
import type { ProviderId } from '../../../shared-contracts/providers/registry';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import { getSettings } from '../settings/settings.repository';
import { listModels } from './model.repository';

// Cheap fallback family per provider when no pricing data is available to rank by.
const CHEAP_FAMILY_HINT: Partial<Record<ProviderId, AnthropicFamily>> = {
  anthropic: 'haiku',
};

function priceOf(m: ModelDTO): number | null {
  if (!m.pricing) return null;
  return m.pricing.prompt + m.pricing.completion;
}

// Free models (e.g. OpenRouter `:free` variants) get deactivated without notice,
// so Auto must never pick one — it would resurrect the original title bug.
export function isFreeModel(m: ModelDTO): boolean {
  return (
    m.id.endsWith(':free') ||
    (m.pricing != null && m.pricing.prompt === 0 && m.pricing.completion === 0)
  );
}

// Cheapest enabled NON-FREE model for the provider. Priced models rank by total
// price (prompt + completion); unpriced models sort last and fall back to a
// known cheap family hint, then to the first enabled model.
function cheapestEnabled(provider: ProviderId): ModelDTO | undefined {
  const enabled = listModels().filter(
    (m) => m.provider === provider && m.isEnabled && !isFreeModel(m),
  );
  if (enabled.length === 0) return undefined;

  const priced = enabled
    .filter((m) => priceOf(m) !== null)
    .sort((a, b) => (priceOf(a) ?? 0) - (priceOf(b) ?? 0));
  if (priced.length > 0) return priced[0];

  const hint = CHEAP_FAMILY_HINT[provider];
  return enabled.find((m) => m.family === hint) ?? enabled[0];
}

// Resolves which model auto-names new chats for a given provider.
// custom + valid (enabled) id -> that id; custom + dead id -> auto fallback;
// auto -> cheapest enabled. null = provider has no enabled models -> skip title.
export function resolveTitleModel(provider: ProviderId): string | null {
  const cfg = getSettings().titleModels[provider];

  if (cfg?.mode === 'custom' && cfg.modelId) {
    const valid = listModels().some(
      (m) => m.id === cfg.modelId && m.provider === provider && m.isEnabled,
    );
    if (valid) return cfg.modelId;
  }

  return cheapestEnabled(provider)?.id ?? null;
}
