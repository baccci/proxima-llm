import type { LanguageModel } from 'ai'
import type { ProviderId } from '../../../../shared-contracts/providers/registry'
import type { ModelDTO } from '../../../../shared-contracts/schemas/model.schema'
import type { ProviderAdapter } from './adapter'
import { AnthropicAdapter } from './anthropic'
import { OpenRouterAdapter } from './openrouter'

const adapters: Record<ProviderId, ProviderAdapter> = {
  anthropic: new AnthropicAdapter(),
  openrouter: new OpenRouterAdapter(),
}

export function getAdapter(provider: string): ProviderAdapter {
  const adapter = adapters[provider as ProviderId]
  if (!adapter) {
    throw new Error(`Unknown provider: ${provider}`)
  }
  return adapter
}

export function buildModel(model: ModelDTO, apiKey: string): LanguageModel {
  return getAdapter(model.provider).buildModel(model.id, apiKey)
}
