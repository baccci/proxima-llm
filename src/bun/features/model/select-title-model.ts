import type { AnthropicFamily } from '../../../shared-contracts/models/families';
import type { ProviderId } from '../../../shared-contracts/providers/registry';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import type { ProviderTitleConfig } from '../../../shared-contracts/schemas/settings.schema';

// Cheap fallback family per provider when no pricing data is available to rank by.
const CHEAP_FAMILY_HINT: Partial<Record<ProviderId, AnthropicFamily>> = {
  anthropic: 'haiku',
};

function priceOf(m: ModelDTO): number | null {
  if (!m.pricing) {
    return null;
  }

  return m.pricing.prompt + m.pricing.completion;
}

// Free models (e.g. OpenRouter `:free` variants) get deactivated without notice,
// so Auto must never pick one, since it would resurrect the original title bug.
export function isFreeModel(m: ModelDTO): boolean {
  return (
    m.id.endsWith(':free') ||
    (m.pricing != null && m.pricing.prompt === 0 && m.pricing.completion === 0)
  );
}

// Cheapest enabled NON-FREE model for the provider. Priced models rank by total
// price (prompt + completion); unpriced models sort last and fall back to a
// known cheap family hint, then to the first enabled model.
function selectCheapestEnabled(models: ModelDTO[], provider: ProviderId): ModelDTO | undefined {
  const enabled = models.filter((m) => m.provider === provider && m.isEnabled && !isFreeModel(m));
  if (enabled.length === 0) {
    return undefined;
  }

  const priced = enabled
    .filter((m) => priceOf(m) !== null)
    .sort((a, b) => (priceOf(a) ?? 0) - (priceOf(b) ?? 0));
  if (priced.length > 0) {
    return priced[0];
  }

  const hint = CHEAP_FAMILY_HINT[provider];
  return enabled.find((m) => m.family === hint) ?? enabled[0];
}

// Resolves which model auto-names new chats for a given provider. Pure: the caller
// supplies the live model list and the user's per-provider title config.
// custom + valid (enabled) id -> that id; custom + dead id -> auto fallback;
// auto -> cheapest enabled. null = provider has no enabled models -> skip title.
export function selectTitleModel(
  models: ModelDTO[],
  cfg: ProviderTitleConfig | undefined,
  provider: ProviderId,
): string | null {
  if (cfg?.mode === 'custom' && cfg.modelId) {
    const valid = models.some(
      (m) => m.id === cfg.modelId && m.provider === provider && m.isEnabled,
    );

    if (valid) {
      return cfg.modelId;
    }
  }

  return selectCheapestEnabled(models, provider)?.id ?? null;
}
