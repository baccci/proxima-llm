import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export function buildAnthropicModel(modelId: string, apiKey: string): LanguageModel {
  const anthropic = createAnthropic({ apiKey });
  return anthropic(modelId);
}
