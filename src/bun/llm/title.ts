import { generateText } from 'ai';
import { buildAnthropicModel } from './providers/anthropic';
import { buildOpenRouterModel } from './providers/openrouter';

// Cheapest/fastest model per provider for title generation
const TITLE_MODEL_IDS: Partial<Record<string, string>> = {
  anthropic: 'claude-haiku-4-5-20251001',
  openrouter: 'google/gemma-4-31b-it:free',
};

const MAX_TITLE_LENGTH = 60;
const TITLE_PROMPT = (msg: string) =>
  `Summarize the following message into a short chat title of 6 words or fewer. No quotes, no punctuation at the end, no explanations — just the title.\n\n${msg}`;

export async function generateChatTitle(
  firstUserMessage: string,
  provider: string,
  apiKey: string,
): Promise<string> {
  const modelId = TITLE_MODEL_IDS[provider];
  if (!modelId) throw new Error(`No title model configured for provider: ${provider}`);

  const model =
    provider === 'anthropic'
      ? buildAnthropicModel(modelId, apiKey)
      : buildOpenRouterModel(modelId, apiKey);

  const { text } = await generateText({
    model,
    messages: [{ role: 'user', content: TITLE_PROMPT(firstUserMessage) }],
  });
  return text.trim().slice(0, MAX_TITLE_LENGTH);
}
