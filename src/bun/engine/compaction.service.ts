import { generateText } from 'ai';
import {
  type MessageDTO,
  MessageRole,
  PartKind,
} from '../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../shared-contracts/schemas/model.schema';
import * as chatService from '../features/chat/chat.repository';
import { getLatestSnapshot, saveSnapshot } from '../features/compaction/compaction.repository';
import { getModel } from '../features/model/model.repository';
import { resolveTitleModel } from '../features/model/title-model.service';
import { getApiKey } from '../infra/keychain';
import { getAdapter } from '../infra/llm/providers/index';

const KEEP_RECENT = 15;
// A manual "compact now" (ring click) is an explicit free-context action, so it
// keeps a smaller recent window than the automatic threshold pass. Otherwise
// clicking right after an auto-compaction would be a no-op.
const MANUAL_KEEP_RECENT = 6;

function buildCompactionPrompt(
  previousSummary: string | undefined,
  messages: MessageDTO[],
): string {
  const lines: string[] = [];
  if (previousSummary) {
    lines.push('## Previous conversation summary');
    lines.push(previousSummary);
    lines.push('');
  }
  lines.push('## Conversation turns to summarize');
  for (const m of messages) {
    const role = m.role === MessageRole.enum.user ? 'User' : 'Assistant';
    const text = m.parts
      .filter(
        (p): p is Extract<MessageDTO['parts'][number], { type: 'text' }> =>
          p.type === PartKind.enum.text,
      )
      .map((p) => p.text)
      .join(' ');
    if (text) {
      lines.push(`${role}: ${text}`);
    }
  }
  lines.push('');
  lines.push(
    'Write a dense summary of this conversation (incorporating any prior summary). Preserve all key decisions, facts, and context. Be thorough but concise.',
  );
  return lines.join('\n');
}

export type CompactOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  // Dev override (Force compact) — summarize down to this many recent turns
  // instead of KEEP_RECENT, so a short chat actually compacts. 0 = summarize all.
  keepRecent?: number;
};

export type CompactResult =
  | { status: 'ok'; summarized: number }
  | { status: 'noop'; reason: 'nothing-to-summarize' | 'no-title-model' | 'empty-summary' };

export async function compact(
  chatId: string,
  model: ModelDTO,
  apiKey: string,
  opts: CompactOptions = {},
): Promise<CompactResult> {
  const prev = getLatestSnapshot(chatId);
  const all = chatService.listMessages(chatId);
  const since = prev ? all.filter((m) => m.createdAt > prev.coveredThroughAt) : all;
  const keep = opts.keepRecent ?? KEEP_RECENT;
  // slice(0, -0) is slice(0, 0) = [], so handle keep<=0 explicitly.
  const toSummarize = keep > 0 ? since.slice(0, -keep) : since.slice();
  if (toSummarize.length === 0) {
    return { status: 'noop', reason: 'nothing-to-summarize' };
  }

  const boundary = toSummarize.at(-1)!;
  // Chat tail at compaction time — divider display anchor (kept-full recent messages
  // sit between `boundary` and this, above the line).
  const displayBoundary = since.at(-1)!;
  const titleModelId = resolveTitleModel(model.provider);
  if (!titleModelId) {
    return { status: 'noop', reason: 'no-title-model' };
  }

  // Bound the summary call so a slow/hung cheap model can't block stream start.
  const signals: AbortSignal[] = [];
  if (opts.signal) {
    signals.push(opts.signal);
  }
  if (opts.timeoutMs) {
    signals.push(AbortSignal.timeout(opts.timeoutMs));
  }
  const abortSignal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

  const prompt = buildCompactionPrompt(prev?.summaryText, toSummarize);
  const llmModel = getAdapter(model.provider).buildModel(titleModelId, apiKey);
  const { text } = await generateText({
    model: llmModel,
    messages: [{ role: 'user', content: prompt }],
    abortSignal,
  });
  const summaryText = text.trim();
  if (!summaryText) {
    return { status: 'noop', reason: 'empty-summary' };
  }

  saveSnapshot({
    chatId,
    coveredThroughAt: new Date(boundary.createdAt),
    coveredThroughMessageId: boundary.id,
    displayThroughAt: new Date(displayBoundary.createdAt),
    summaryText,
  });

  return { status: 'ok', summarized: toSummarize.length };
}

// Resolve the model and API key a chat streams with. Throws a user-facing error
// if the chat has no model set, the model id is unknown, or its provider has no
// stored key. Shared by the manual and dev compaction entry points.
function resolveChatModel(chatId: string): { model: ModelDTO; apiKey: string } {
  const chat = chatService.getChat(chatId);
  if (!chat?.modelId) {
    throw new Error('No model selected for chat');
  }

  const model = getModel(chat.modelId);
  if (!model) {
    throw new Error(`Unknown model: ${chat.modelId}`);
  }

  const apiKey = getApiKey(model.provider);
  if (!apiKey) {
    throw new Error(`No API key for ${model.provider}`);
  }

  return { model, apiKey };
}

// Manual "compact now" (ring click): an explicit free-context action, so it keeps
// a smaller recent window than the automatic pass.
export function compactChatNow(chatId: string): Promise<CompactResult> {
  const { model, apiKey } = resolveChatModel(chatId);
  return compact(chatId, model, apiKey, { keepRecent: MANUAL_KEEP_RECENT });
}

// Dev tool "force compact": summarize the whole chat (keepRecent 0) so even a
// short test conversation produces a snapshot.
export function forceCompactChat(chatId: string): Promise<CompactResult> {
  const { model, apiKey } = resolveChatModel(chatId);
  return compact(chatId, model, apiKey, { keepRecent: 0 });
}
