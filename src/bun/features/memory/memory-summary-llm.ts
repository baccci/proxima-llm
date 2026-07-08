import { generateText } from 'ai';
import { getAdapter } from '../../core/llm/providers/index';

const MAX_SUMMARY_LENGTH = 400;

const SUMMARY_PROMPT = (slices: { title: string; content: string }[]) => {
  const formatted = slices.map((s) => `- ${s.title}: ${s.content}`).join('\n');
  return `Summarize the following saved memory entries into one short paragraph (no markdown, no lists, no more than 60 words) describing what is known:\n\n${formatted}`;
};

export async function generateMemorySummary(
  slices: { title: string; content: string }[],
  provider: string,
  apiKey: string,
  modelId: string,
): Promise<string> {
  const model = getAdapter(provider).buildModel(modelId, apiKey);
  const { text } = await generateText({
    model,
    messages: [{ role: 'user', content: SUMMARY_PROMPT(slices) }],
  });
  return text.trim().slice(0, MAX_SUMMARY_LENGTH);
}
