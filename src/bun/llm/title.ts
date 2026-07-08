import { generateText } from 'ai';
import type { ProviderId } from '../../shared-contracts/providers/registry';
import { getAdapter } from './providers/index';

const MAX_TITLE_LENGTH = 60;
const TITLE_PROMPT = (msg: string) =>
  `Summarize the following message into a short chat title of 6 words or fewer. No quotes, no punctuation at the end, no explanations — just the title.\n\n${msg}`;

// modelId is resolved by the caller (resolveTitleModel) from the chat's provider
// and the user's per-provider title-model setting.
export async function generateChatTitle(
  firstUserMessage: string,
  provider: ProviderId,
  apiKey: string,
  modelId: string,
): Promise<string> {
  const model = getAdapter(provider).buildModel(modelId, apiKey);

  const { text } = await generateText({
    model,
    messages: [{ role: 'user', content: TITLE_PROMPT(firstUserMessage) }],
  });
  return text.trim().slice(0, MAX_TITLE_LENGTH);
}
