import type { ToolCallOptions } from '@ai-sdk/provider-utils';
import { type ModelMessage, stepCountIs, streamText, type Tool } from 'ai';
import type { StreamChunk } from '../../shared-contracts/rpc/app-rpc.types';
import type {
  MessageDTO,
  MessagePart,
  TokenUsage,
} from '../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../shared-contracts/schemas/model.schema';
import type { ProjectDTO } from '../../shared-contracts/schemas/project.schema';
import { getPolicy } from '../services/tool-permission.service';
import { buildModel } from './providers/index';
import { buildBaseSystemPrompt } from './system-prompt';
import { BUILTIN_TOOLS } from './tools/registry';

type ApprovalResult = { decision: 'allow' | 'deny'; remember: boolean };

type StreamOptions = {
  model: ModelDTO;
  apiKey: string;
  project: ProjectDTO | null;
  history: MessageDTO[];
  thinking: boolean;
  webSearch: boolean;
  getToolGrant: (toolName: string) => 'allow' | 'deny' | undefined;
  setToolGrant: (toolName: string, decision: 'allow' | 'deny') => void;
  onChunk: (chunk: StreamChunk) => void;
  awaitApproval: (toolCallId: string, toolName: string, input: unknown) => Promise<ApprovalResult>;
  signal: AbortSignal;
  maxRetries: number;
  requestTimeoutMs: number;
  resolveAttachment: (
    id: string,
  ) => { dataBase64: string; mediaType: string; kind: 'image' | 'file' } | undefined;
};

function buildSystem(
  model: ModelDTO,
  project: ProjectDTO | null,
  webSearchActive: boolean,
): string {
  const parts: string[] = [buildBaseSystemPrompt(model, webSearchActive)];
  if (project?.systemPrompt) parts.push(project.systemPrompt);
  if (project?.memory) parts.push(`# Project memory\n${project.memory}`);
  return parts.join('\n\n');
}

type CoreTextPart = { type: 'text'; text: string };
type CoreImagePart = { type: 'image'; image: string; mediaType: string };
type CoreFilePart = { type: 'file'; data: string; mediaType: string };
type CoreToolCallPart = { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown };
type CoreToolResultPart = {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
};

function toCoreMessages(
  history: MessageDTO[],
  resolveAttachment: StreamOptions['resolveAttachment'],
): ModelMessage[] {
  const result: ModelMessage[] = [];

  for (const m of history) {
    if (m.role === 'system') continue;

    if (m.role === 'user') {
      const content: Array<CoreTextPart | CoreImagePart | CoreFilePart> = [];
      for (const p of m.parts) {
        if (p.type === 'text') {
          content.push({ type: 'text', text: p.text });
        } else if (p.type === 'image') {
          const resolved = resolveAttachment(p.attachmentId);
          if (resolved)
            content.push({
              type: 'image',
              image: resolved.dataBase64,
              mediaType: resolved.mediaType,
            });
          else content.push({ type: 'text', text: '[missing attachment]' });
        } else if (p.type === 'file') {
          const resolved = resolveAttachment(p.attachmentId);
          if (resolved)
            content.push({
              type: 'file',
              data: resolved.dataBase64,
              mediaType: resolved.mediaType,
            });
          else content.push({ type: 'text', text: '[missing attachment]' });
        }
      }
      result.push({ role: 'user', content } as ModelMessage);
      continue;
    }

    if (m.role === 'assistant') {
      const assistantContent: Array<CoreTextPart | CoreToolCallPart> = [];
      const toolResults: CoreToolResultPart[] = [];

      for (const p of m.parts) {
        if (p.type === 'text' || p.type === 'reasoning') {
          assistantContent.push({ type: 'text', text: p.text });
        } else if (p.type === 'tool-call') {
          assistantContent.push({
            type: 'tool-call',
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            input: p.input,
          });
        } else if (p.type === 'tool-result') {
          toolResults.push({
            type: 'tool-result',
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            output: p.output,
          });
        }
      }

      if (assistantContent.length > 0 || toolResults.length === 0) {
        result.push({ role: 'assistant', content: assistantContent } as ModelMessage);
      }
      if (toolResults.length > 0) {
        result.push({ role: 'tool', content: toolResults } as ModelMessage);
      }
    }
  }

  return result;
}

// Build per-provider request options: prompt caching + thinking/reasoning controls.
function buildProviderOptions(opts: StreamOptions, webSearchActive: boolean) {
  const anthropicOptions: Record<string, unknown> = {};
  const openrouterOptions: Record<string, unknown> = {};

  // Cache the system block ephemerally (Anthropic only). System prompt is stable every
  // turn, so every turn after the first is a cache read. Cache writes cost slightly more,
  // so only apply when the model capability flag opts in.
  if (opts.model.capabilities.promptCaching && opts.model.provider === 'anthropic') {
    anthropicOptions.cacheControl = { type: 'ephemeral' };
  }

  if (opts.model.capabilities.thinking) {
    if (opts.model.provider === 'anthropic') {
      // Anthropic only reasons when explicitly enabled.
      if (opts.thinking) {
        anthropicOptions.thinking = {
          type: 'enabled',
          budgetTokens: opts.model.capabilities.defaultThinkingBudget ?? 8_000,
        };
      }
    } else if (opts.model.provider === 'openrouter') {
      // OpenRouter reasoning models reason BY DEFAULT, so we must explicitly disable it when the toggle is off.
      // Note: some models reason unconditionally and may ignore enabled:false.
      openrouterOptions.reasoning = { enabled: opts.thinking };
    }
  }

  if (webSearchActive) {
    openrouterOptions.plugins = [{ id: 'web' }];
  }

  const hasAnthropic = Object.keys(anthropicOptions).length > 0;
  const hasOpenRouter = Object.keys(openrouterOptions).length > 0;
  if (!hasAnthropic && !hasOpenRouter) return undefined;
  return {
    ...(hasAnthropic ? { anthropic: anthropicOptions } : {}),
    ...(hasOpenRouter ? { openrouter: openrouterOptions } : {}),
  };
}

// Wrap each registered tool's execute with the two-layer policy gate.
// Layer 1: global per-tool policy (deny/allow/ask). Layer 2: per-chat grant (only when global is 'ask').
function buildGatedTools(
  onChunk: StreamOptions['onChunk'],
  awaitApproval: StreamOptions['awaitApproval'],
  getToolGrant: StreamOptions['getToolGrant'],
  setToolGrant: StreamOptions['setToolGrant'],
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const [name, entry] of Object.entries(BUILTIN_TOOLS)) {
    const originalExecute = entry.tool.execute;
    tools[name] = {
      ...entry.tool,
      execute: async (input: unknown, callOpts: ToolCallOptions) => {
        const policy = getPolicy(name); // Layer 1 — global

        if (policy === 'deny') {
          return { blocked: true, reason: 'Denied by policy.' };
        }

        if (policy === 'allow') {
          return originalExecute!(input as never, callOpts);
        }

        // policy === 'ask' → Layer 2 — per-chat grant
        const grant = getToolGrant(name);
        if (grant === 'deny') {
          return { blocked: true, reason: 'Denied for this chat.' };
        }
        if (grant !== 'allow') {
          onChunk({
            kind: 'tool-approval-request',
            toolCallId: callOpts.toolCallId,
            toolName: name,
            input,
          });
          const { decision, remember } = await awaitApproval(callOpts.toolCallId, name, input);
          if (remember) setToolGrant(name, decision === 'allow' ? 'allow' : 'deny');
          if (decision === 'deny') {
            return { blocked: true, reason: 'Denied by user.' };
          }
        }

        return originalExecute!(input as never, callOpts);
      },
    };
  }

  return tools;
}

export async function runStream(opts: StreamOptions): Promise<{
  parts: MessagePart[];
  usage: TokenUsage | null;
  stopReason?: 'user-cancel' | 'idle-timeout';
}> {
  const webSearchActive =
    opts.webSearch && opts.model.provider === 'openrouter' && opts.model.capabilities.webSearch;

  const languageModel = buildModel(opts.model, opts.apiKey);
  const system = buildSystem(opts.model, opts.project, webSearchActive);
  const tools = buildGatedTools(
    opts.onChunk,
    opts.awaitApproval,
    opts.getToolGrant,
    opts.setToolGrant,
  );

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

  const providerOptions = buildProviderOptions(opts, webSearchActive) as Parameters<
    typeof streamText
  >[0]['providerOptions'];

  const result = streamText({
    model: languageModel,
    system,
    messages: toCoreMessages(opts.history, opts.resolveAttachment),
    tools,
    stopWhen: stepCountIs(5),
    abortSignal,
    maxRetries: opts.maxRetries,
    ...(providerOptions ? { providerOptions } : {}),
  });

  const parts: MessagePart[] = [];
  let streamError: Error | null = null;
  let stopReason: 'user-cancel' | 'idle-timeout' | undefined;
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
