import type { LanguageModel } from 'ai';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import { buildAnthropicModel } from './anthropic';
import { buildOpenRouterModel } from './openrouter';

export function buildModel(model: ModelDTO, apiKey: string): LanguageModel {
  switch (model.provider) {
    case 'anthropic':
      return buildAnthropicModel(model.id, apiKey);
    case 'openrouter':
      return buildOpenRouterModel(model.id, apiKey);
    default:
      throw new Error(`Unknown provider: ${model.provider}`);
  }
}
