import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';

export function buildOpenRouterModel(modelId: string, apiKey: string): LanguageModel {
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(modelId);
}
