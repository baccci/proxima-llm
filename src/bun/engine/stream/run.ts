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
import { createStreamAccumulator } from './stream-accumulator';
import { classifyAbort, extractUsage, IDLE_TIMEOUT_ERROR_NAME } from './stream-result';

// Max agentic steps before the run stops on its own (tool-call round trips).
const MAX_STEPS = 5;

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
      () => idleController.abort(new DOMException('idle-timeout', IDLE_TIMEOUT_ERROR_NAME)),
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
    stopWhen: stepCountIs(MAX_STEPS),
    abortSignal,
    maxRetries: opts.maxRetries,
    ...(providerOptions ? { providerOptions } : {}),
  });

  const acc = createStreamAccumulator();
  let stopReason: StopReason | undefined;

  try {
    for await (const delta of result.fullStream) {
      resetIdle();

      switch (delta.type) {
        case 'text-delta':
          opts.onChunk({ kind: 'text-delta', delta: delta.text });
          acc.addText(delta.text);
          break;
        case 'reasoning-delta':
          opts.onChunk({ kind: 'reasoning-delta', delta: delta.text });
          acc.addReasoning(delta.text);
          break;
        case 'source':
          if (delta.sourceType === 'url') {
            opts.onChunk({ kind: 'source', url: delta.url, title: delta.title });
            acc.addSource(delta.url, delta.title);
          }
          break;
        case 'tool-call':
          opts.onChunk({
            kind: 'tool-call',
            toolCallId: delta.toolCallId,
            toolName: String(delta.toolName),
            input: delta.input,
          });
          acc.addToolCall(delta.toolCallId, String(delta.toolName), delta.input);
          break;
        case 'tool-result':
          opts.onChunk({ kind: 'tool-result', toolCallId: delta.toolCallId, output: delta.output });
          acc.addToolResult(delta.toolCallId, String(delta.toolName), delta.output);
          break;
        case 'error':
          acc.setError(delta.error instanceof Error ? delta.error : new Error(String(delta.error)));
          break;
      }
    }
  } catch (err) {
    if (abortSignal.aborted) {
      stopReason = classifyAbort(abortSignal);
    } else {
      clearTimeout(idleTimer);
      throw err;
    }
  } finally {
    clearTimeout(idleTimer);
  }

  const { parts, error: streamError } = acc.finish();

  // A clean-loop abort (an error delta, nothing thrown) leaves stopReason unset.
  // Recover it from the signal so that path doesn't surface as a real error.
  if (!stopReason && abortSignal.aborted) {
    stopReason = classifyAbort(abortSignal);
  }

  if (stopReason) {
    return { parts, usage: null, stopReason };
  }

  if (streamError) {
    throw streamError;
  }

  const rawUsage = await result.usage;
  const meta = await result.providerMetadata;
  const usage = extractUsage(rawUsage, meta);

  return { parts, usage };
}
