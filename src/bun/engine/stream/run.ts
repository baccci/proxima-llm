import { stepCountIs, streamText } from 'ai';
import { providerSupportsWebSearch } from '../../../shared-contracts/providers/registry';
import type { StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import type {
  MessageDTO,
  MessagePart,
  StopReason,
  TokenUsage,
} from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import type { ProjectDTO } from '../../../shared-contracts/schemas/project.schema';
import type { ToolDecision } from '../../../shared-contracts/tools/tool-policy';
import type { CompactionSnapshot } from '../../features/compaction/compaction.repository';
import { buildModel, getAdapter } from '../../infra/llm/providers/index';
import { buildSystem, type ResolveAttachment, toCoreMessages } from './build-prompt';
import { type ApprovalResult, buildGatedTools } from './gate-tools';

type StreamOptions = {
  model: ModelDTO;
  apiKey: string;
  project: ProjectDTO | null;
  history: MessageDTO[];
  snapshot?: CompactionSnapshot;
  thinking: boolean;
  webSearch: boolean;
  effort?: string | null;
  sliceTitles?: { global: string[]; project: string[] };
  projectFileNames?: string[];
  getToolGrant: (toolName: string) => ToolDecision | undefined;
  setToolGrant: (toolName: string, decision: ToolDecision) => void;
  onChunk: (chunk: StreamChunk) => void;
  awaitApproval: (toolCallId: string, toolName: string, input: unknown) => Promise<ApprovalResult>;
  signal: AbortSignal;
  maxRetries: number;
  requestTimeoutMs: number;
  resolveAttachment: ResolveAttachment;
};

export async function runStream(opts: StreamOptions): Promise<{
  parts: MessagePart[];
  usage: TokenUsage | null;
  stopReason?: StopReason;
}> {
  const webSearchActive =
    opts.webSearch &&
    providerSupportsWebSearch(opts.model.provider) &&
    opts.model.capabilities.webSearch;

  const languageModel = buildModel(opts.model, opts.apiKey);
  const system = buildSystem(
    opts.model,
    opts.project,
    webSearchActive,
    opts.sliceTitles,
    opts.projectFileNames,
    opts.snapshot,
  );
  const serverTools = getAdapter(opts.model.provider).buildServerTools?.(opts.model, {
    thinking: opts.thinking,
    effort: opts.effort ?? null,
    webSearch: webSearchActive,
  });
  const tools = {
    ...buildGatedTools(
      opts.project?.id,
      opts.onChunk,
      opts.awaitApproval,
      opts.getToolGrant,
      opts.setToolGrant,
    ),
    ...(serverTools ?? {}),
  };

  const idleController = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => idleController.abort(new DOMException('idle-timeout', 'TimeoutError')),
      opts.requestTimeoutMs,
    );
  };
  resetIdle();
  const abortSignal = AbortSignal.any([opts.signal, idleController.signal]);

  const providerOptions = getAdapter(opts.model.provider).buildProviderOptions(opts.model, {
    thinking: opts.thinking,
    effort: opts.effort ?? null,
    webSearch: webSearchActive,
  }) as Parameters<typeof streamText>[0]['providerOptions'];

  const result = streamText({
    model: languageModel,
    system,
    messages: toCoreMessages(opts.history, opts.resolveAttachment, opts.snapshot),
    tools,
    stopWhen: stepCountIs(5),
    abortSignal,
    maxRetries: opts.maxRetries,
    ...(providerOptions ? { providerOptions } : {}),
  });

  const parts: MessagePart[] = [];
  let streamError: Error | null = null;
  let stopReason: StopReason | undefined;
  let reasoningStart: number | null = null;
  let reasoningEnd: number | null = null;

  try {
    for await (const delta of result.fullStream) {
      resetIdle();
      if (delta.type === 'text-delta') {
        if (reasoningStart !== null && reasoningEnd === null) {
          reasoningEnd = Date.now();
        }
        opts.onChunk({ kind: 'text-delta', delta: delta.text });
        const last = parts[parts.length - 1];
        if (last?.type === 'text') last.text += delta.text;
        else parts.push({ type: 'text', text: delta.text });
      } else if (delta.type === 'reasoning-delta') {
        if (reasoningStart === null) {
          reasoningStart = Date.now();
        }
        opts.onChunk({ kind: 'reasoning-delta', delta: delta.text });
        const last = parts[parts.length - 1];
        if (last?.type === 'reasoning') last.text += delta.text;
        else parts.push({ type: 'reasoning', text: delta.text });
      } else if (delta.type === 'source' && delta.sourceType === 'url') {
        opts.onChunk({ kind: 'source', url: delta.url, title: delta.title });
        parts.push({ type: 'source', url: delta.url, title: delta.title });
      } else if (delta.type === 'tool-call') {
        const { toolCallId, toolName, input } = delta;
        opts.onChunk({ kind: 'tool-call', toolCallId, toolName: String(toolName), input });
        parts.push({ type: 'tool-call', toolCallId, toolName: String(toolName), input });
      } else if (delta.type === 'tool-result') {
        const { toolCallId, toolName, output } = delta;
        opts.onChunk({ kind: 'tool-result', toolCallId, output });
        parts.push({ type: 'tool-result', toolCallId, toolName: String(toolName), output });
      } else if (delta.type === 'error') {
        streamError = delta.error instanceof Error ? delta.error : new Error(String(delta.error));
      }
    }
  } catch (err) {
    if (abortSignal.aborted) {
      const reason = abortSignal.reason;
      stopReason =
        reason instanceof DOMException && reason.name === 'TimeoutError'
          ? 'idle-timeout'
          : 'user-cancel';
    } else {
      clearTimeout(idleTimer);
      throw err;
    }
  } finally {
    clearTimeout(idleTimer);
  }

  if (reasoningStart !== null) {
    if (reasoningEnd === null) reasoningEnd = Date.now();
    const reasoningPart = parts.find(
      (p): p is Extract<MessagePart, { type: 'reasoning' }> => p.type === 'reasoning',
    );
    if (reasoningPart) reasoningPart.durationMs = reasoningEnd - reasoningStart;
  }

  // An abort can surface as a thrown error (caught above) OR as a delta.type === 'error'
  // event that ends the loop normally. Classify from the signal so neither path leaks as a
  // genuine error.
  if (!stopReason && abortSignal.aborted) {
    const reason = abortSignal.reason;
    stopReason =
      reason instanceof DOMException && reason.name === 'TimeoutError'
        ? 'idle-timeout'
        : 'user-cancel';
  }

  if (stopReason) {
    return { parts, usage: null, stopReason };
  }

  if (streamError) throw streamError;

  const rawUsage = await result.usage;
  const meta = await result.providerMetadata;
  const anthropicMeta = meta?.anthropic;

  const anthropicCacheRead =
    typeof anthropicMeta?.cacheReadInputTokens === 'number'
      ? anthropicMeta.cacheReadInputTokens
      : undefined;
  const orCachedTokens = (
    meta?.openrouter as { promptTokensDetails?: { cachedTokens?: number } } | undefined
  )?.promptTokensDetails?.cachedTokens;
  const openrouterCacheRead = typeof orCachedTokens === 'number' ? orCachedTokens : undefined;

  const usage: TokenUsage | null = rawUsage
    ? {
        inputTokens: rawUsage.inputTokens ?? 0,
        outputTokens: rawUsage.outputTokens ?? 0,
        cacheWriteTokens:
          typeof anthropicMeta?.cacheCreationInputTokens === 'number'
            ? anthropicMeta.cacheCreationInputTokens
            : undefined,
        cacheReadTokens: anthropicCacheRead ?? openrouterCacheRead,
      }
    : null;

  return { parts, usage };
}
