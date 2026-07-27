import { generateText } from 'ai';
import { DevOverrideKey } from '../../shared-contracts/dev/dev-override-keys';
import {
  COMPACT_NOOP_REASON,
  COMPACT_STATUS,
  type CompactResult,
} from '../../shared-contracts/rpc/compact-result';
import { STREAM_CHUNK_KIND } from '../../shared-contracts/rpc/stream-chunk';
import type { ModelDTO } from '../../shared-contracts/schemas/model.schema';
import * as chatService from '../features/chat/chat.repository';
import { getLatestSnapshot, saveSnapshot } from '../features/compaction/compaction.repository';
import * as devOverrides from '../features/dev-overrides/dev-overrides.service';
import { getModel } from '../features/model/model.repository';
import { resolveTitleModel } from '../features/model/title-model.service';
import { getApiKey } from '../infra/keychain';
import { getAdapter } from '../infra/llm/providers/index';
import { log } from '../infra/logging/logger';
import {
  DEFAULT_COMPACTION_RATIO,
  estimateContextTokens,
  exceedsCompactionThreshold,
} from './chat-stream/context-window';
import { buildCompactionPrompt } from './compaction-prompt';
import { selectCompaction } from './compaction-selection';
import type { CompactionContext } from './lifecycle/action';
import { runResilientStep } from './lifecycle/resilient-step';
import { LIFECYCLE_STAGE } from './lifecycle/stages';

const KEEP_RECENT = 15;
// A manual "compact now" (ring click) is an explicit free-context action, so it
// keeps a smaller recent window than the automatic threshold pass. Otherwise
// clicking right after an auto-compaction would be a no-op.
const MANUAL_KEEP_RECENT = 6;

export type CompactOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  // Dev override (Force compact): summarize down to this many recent turns
  // instead of KEEP_RECENT, so a short chat actually compacts. 0 = summarize all.
  keepRecent?: number;
};

export async function compact(
  chatId: string,
  model: ModelDTO,
  apiKey: string,
  opts: CompactOptions = {},
): Promise<CompactResult> {
  const prev = getLatestSnapshot(chatId);
  const all = chatService.listMessages(chatId);
  const keep = opts.keepRecent ?? KEEP_RECENT;
  const selection = selectCompaction(all, prev?.coveredThroughAt, keep);
  if (!selection) {
    return { status: COMPACT_STATUS.noop, reason: COMPACT_NOOP_REASON.nothingToSummarize };
  }

  const { toSummarize, boundary, displayBoundary } = selection;

  // The cheap title model is the primary; the chat's own model is the fallback (it
  // just produced a reply, so its endpoints are live). The chat model id is always
  // set, so the resilient step always has at least one attempt to make.
  const primaryModelId = resolveTitleModel(model.provider);
  const fallbackModelId = model.id;

  // Bound the summary call so a slow/hung model can't block stream start.
  const signals: AbortSignal[] = [];
  if (opts.signal) {
    signals.push(opts.signal);
  }
  if (opts.timeoutMs) {
    signals.push(AbortSignal.timeout(opts.timeoutMs));
  }
  const abortSignal = signals.length > 0 ? AbortSignal.any(signals) : undefined;

  const prompt = buildCompactionPrompt(prev?.summaryText, toSummarize);
  const summaryText = await runResilientStep({
    stage: LIFECYCLE_STAGE.compaction,
    primaryModelId,
    fallbackModelId,
    signal: abortSignal,
    run: async (modelId) => {
      const llmModel = getAdapter(model.provider).buildModel(modelId, apiKey);
      const { text } = await generateText({
        model: llmModel,
        messages: [{ role: 'user', content: prompt }],
        abortSignal,
      });
      return text.trim();
    },
  });
  if (!summaryText) {
    return { status: COMPACT_STATUS.noop, reason: COMPACT_NOOP_REASON.emptySummary };
  }

  saveSnapshot({
    chatId,
    coveredThroughAt: new Date(boundary.createdAt),
    coveredThroughMessageId: boundary.id,
    displayThroughAt: new Date(displayBoundary.createdAt),
    summaryText,
  });

  return { status: COMPACT_STATUS.ok, summarized: toSummarize.length };
}

// Compact the chat's context in place when the estimate crosses the model's threshold.
// Non-fatal: a failed compaction just proceeds with full history. The compacting divider is
// shown for the attempt and cleared in the finally.
export async function maybeCompact(ctx: CompactionContext): Promise<void> {
  const tokens =
    devOverrides.getOverride<number>(DevOverrideKey.enum.forcedContextTokens) ??
    estimateContextTokens(ctx.history);
  const ratio =
    devOverrides.getOverride<number>(DevOverrideKey.enum.compactionRatio) ??
    DEFAULT_COMPACTION_RATIO;
  if (!exceedsCompactionThreshold(tokens, ctx.model, ratio)) {
    return;
  }

  ctx.emitChunk({ kind: STREAM_CHUNK_KIND.compacting, active: true });
  try {
    await compact(ctx.chatId, ctx.model, ctx.apiKey, {
      signal: ctx.signal,
      timeoutMs: ctx.requestTimeoutMs,
    });
  } catch (err) {
    log.error('Context compaction failed (non-fatal)', err);
  } finally {
    ctx.emitChunk({ kind: STREAM_CHUNK_KIND.compacting, active: false });
  }
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
