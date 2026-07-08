import { generateText } from 'ai';
import { randomUUID } from 'crypto';
import { desc, eq } from 'drizzle-orm';
import type { MessageDTO } from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import { db } from '../../core/db/client';
import { compactionSnapshots } from '../../core/db/schema';
import { getAdapter } from '../../core/llm/providers/index';
import * as chatService from '../chat/chat.repository';
import { resolveTitleModel } from '../model/title-model.service';

const KEEP_RECENT = 15;
// A manual "compact now" (ring click) is an explicit free-context action, so it
// keeps a smaller recent window than the automatic threshold pass — otherwise
// clicking right after an auto-compaction is a no-op.
export const MANUAL_KEEP_RECENT = 6;

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
    const role = m.role === 'user' ? 'User' : 'Assistant';
    const text = m.parts
      .filter((p): p is Extract<MessageDTO['parts'][number], { type: 'text' }> => p.type === 'text')
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

export type CompactionSnapshot = {
  // Boundary the model summarizes through — messages newer than this are sent in full.
  coveredThroughAt: string;
  // Chat tail at compaction time — where the UI divider renders (bottom). Falls back
  // to coveredThroughAt for pre-existing rows that predate the column.
  displayThroughAt: string;
  summaryText: string;
};

export function getLatestSnapshot(chatId: string): CompactionSnapshot | undefined {
  const row = db
    .select()
    .from(compactionSnapshots)
    .where(eq(compactionSnapshots.chatId, chatId))
    .orderBy(desc(compactionSnapshots.createdAt))
    .limit(1)
    .get();
  if (!row) {
    return undefined;
  }

  const coveredThroughAt = row.coveredThroughAt.toISOString();
  return {
    coveredThroughAt,
    displayThroughAt: row.displayThroughAt ? row.displayThroughAt.toISOString() : coveredThroughAt,
    summaryText: row.summaryText,
  };
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

  db.insert(compactionSnapshots)
    .values({
      id: randomUUID(),
      chatId,
      createdAt: new Date(),
      coveredThroughAt: new Date(boundary.createdAt),
      coveredThroughMessageId: boundary.id,
      displayThroughAt: new Date(displayBoundary.createdAt),
      summaryText,
      tokensSaved: null,
    })
    .run();

  return { status: 'ok', summarized: toSummarize.length };
}
