import type { ToolCallOptions } from '@ai-sdk/provider-utils';
import { type ModelMessage, stepCountIs, streamText, type Tool } from 'ai';
import { providerSupportsWebSearch } from '../../shared-contracts/providers/registry';
import type { StreamChunk } from '../../shared-contracts/rpc/app-rpc.types';
import type {
  MessageDTO,
  MessagePart,
  TokenUsage,
} from '../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../shared-contracts/schemas/model.schema';
import type { ProjectDTO } from '../../shared-contracts/schemas/project.schema';
import { isAlwaysAllowed } from '../../shared-contracts/tools/tool-catalog';
import type { CompactionSnapshot } from '../services/compaction.service';
import { getPolicy } from '../services/tool-permission.service';
import { buildModel, getAdapter } from './providers/index';
import { buildBaseSystemPrompt, MEMORY_GUIDANCE } from './system-prompt';
import { BUILTIN_TOOLS } from './tools/registry';

type ApprovalResult = { decision: 'allow' | 'deny'; remember: boolean };

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
  sliceTitles?: { global: string[]; project: string[] },
  projectFileNames?: string[],
  snapshot?: CompactionSnapshot,
): string {
  const parts: string[] = [buildBaseSystemPrompt(model, webSearchActive)];

  if (project?.description) parts.push(project.description);

  const globalTitles = sliceTitles?.global ?? [];
  const projectTitles = sliceTitles?.project ?? [];

  const memLines: string[] = [MEMORY_GUIDANCE];
  memLines.push(
    globalTitles.length > 0
      ? `Global notes: ${globalTitles.map((t) => `"${t}"`).join(', ')}`
      : 'Global notes: none saved yet.',
  );
  if (project != null) {
    memLines.push(
      projectTitles.length > 0
        ? `Project notes: ${projectTitles.map((t) => `"${t}"`).join(', ')}`
        : 'Project notes: none saved yet.',
    );
  }
  parts.push(memLines.join('\n'));

  const fileNames = projectFileNames ?? [];
  if (project != null && fileNames.length > 0) {
    const lines: string[] = [
      '# Project files',
      'Files attached to this project. Read one with read_project_file when needed.',
      ...fileNames.map((n) => `- ${n}`),
    ];
    parts.push(lines.join('\n'));
  }

  if (snapshot?.summaryText) {
    parts.push(`## Earlier conversation summary\n${snapshot.summaryText}`);
  }

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
  snapshot?: CompactionSnapshot,
): ModelMessage[] {
  const result: ModelMessage[] = [];
  const filtered = snapshot
    ? history.filter((m) => m.createdAt > snapshot.coveredThroughAt)
    : history;

  for (const m of filtered) {
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
            output: { type: 'json', value: p.output },
          });
        }
      }

      const resolvedIds = new Set(toolResults.map((r) => r.toolCallId));
      for (const p of assistantContent) {
        if (p.type === 'tool-call' && !resolvedIds.has(p.toolCallId)) {
          toolResults.push({
            type: 'tool-result',
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            output: { type: 'json', value: { interrupted: true } },
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

// Wrap each registered tool's execute with the two-layer policy gate.
// Layer 1: global per-tool policy (deny/allow/ask). Layer 2: per-chat grant (only when global is 'ask').
function buildGatedTools(
  projectId: string | undefined,
  onChunk: StreamOptions['onChunk'],
  awaitApproval: StreamOptions['awaitApproval'],
  getToolGrant: StreamOptions['getToolGrant'],
  setToolGrant: StreamOptions['setToolGrant'],
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const [name, entry] of Object.entries(BUILTIN_TOOLS)) {
    const resolvedTool = typeof entry.tool === 'function' ? entry.tool({ projectId }) : entry.tool;
    const originalExecute = resolvedTool.execute;
    tools[name] = {
      ...resolvedTool,
      execute: async (input: unknown, callOpts: ToolCallOptions) => {
        if (isAlwaysAllowed(name)) return originalExecute!(input as never, callOpts);
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
