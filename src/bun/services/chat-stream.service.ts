import { randomUUID } from 'crypto';
import type {
  AppRPC,
  RetryMessageInput,
  SendMessageInput,
  StreamChunk,
} from '../../shared-contracts/rpc/app-rpc.types';
import { runStream } from '../llm/stream';
import { generateChatTitle } from '../llm/title';
import { log } from '../logging/logger';
import * as keychain from '../secrets/keychain';
import * as attachmentService from './attachment.service';
import * as chatService from './chat.service';
import * as compactionService from './compaction.service';
import * as devOverrides from './dev-overrides.service';
import * as memoryService from './memory.service';
import { getModel } from './model.service';
import * as projectService from './project.service';
import * as projectFileService from './project-file.service';
import * as settingsService from './settings.service';
import { resolveTitleModel } from './title-model.service';

// In-flight streams: streamId -> AbortController
export const activeStreams = new Map<string, AbortController>();

// Pending tool-approval promises: `${streamId}:${toolCallId}` -> resolver
type ApprovalResolver = (result: { decision: 'allow' | 'deny'; remember: boolean }) => void;
const pendingApprovals = new Map<string, ApprovalResolver>();

export function settlePendingApprovals(streamId: string): void {
  const prefix = `${streamId}:`;
  for (const [key, resolve] of pendingApprovals) {
    if (key.startsWith(prefix)) {
      pendingApprovals.delete(key);
      resolve({ decision: 'deny', remember: false });
    }
  }
}

let sendToWebview: ((chunk: AppRPC['webview']['messages']['streamChunk']) => void) | null = null;
let sendChatsUpdated: (() => void) | null = null;

export function setSendToWebview(fn: typeof sendToWebview): void {
  sendToWebview = fn;
}

export function setSendChatsUpdated(fn: () => void): void {
  sendChatsUpdated = fn;
}

export function pushChatsUpdated(): void {
  sendChatsUpdated?.();
}

export type LifecycleEvent = 'started' | 'done' | 'error';
export interface LifecycleMeta {
  streamId: string;
  chatId: string;
  assistantMessageId: string;
}

export interface StartChatStreamOpts {
  onLifecycle?: (event: LifecycleEvent, meta: LifecycleMeta) => void;
  onChunk?: (chunk: StreamChunk) => void;
}

export interface StartChatStreamResult {
  streamId: string;
  userMessageId: string;
  assistantMessageId: string;
}

interface RunStreamForChatParams {
  chatId: string;
  modelId: string;
  thinking: boolean;
  webSearch: boolean;
  effort?: string | null;
  // sendMessage content only needed for title generation
  originalContent?: string;
}

function runStreamForChat(
  params: RunStreamForChatParams,
  streamId: string,
  controller: AbortController,
  emitChunk: (chunk: StreamChunk) => void,
  opts?: StartChatStreamOpts,
): string {
  const { chatId, modelId, thinking, webSearch, effort, originalContent } = params;

  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model: ${modelId}`);

  const apiKey = keychain.getApiKey(model.provider);
  if (!apiKey) throw new Error(`No API key configured for ${model.provider}`);

  const assistantMsgId = randomUUID();
  emitChunk({ kind: 'start', assistantMessageId: assistantMsgId });

  const chatRow = chatService.getChat(chatId);
  const grants = { ...(chatRow?.composer.toolGrants ?? {}) };
  const project = chatRow?.projectId
    ? (projectService.getProject(chatRow.projectId) ?? null)
    : null;

  const globalSliceTitles = memoryService.listSlices('global').map((s) => s.title);
  const projectSliceTitles = project
    ? memoryService.listSlices('project', project.id).map((s) => s.title)
    : [];
  const projectFileNames = project
    ? projectFileService.listProjectFiles(project.id).map((f) => f.name)
    : [];

  const awaitApproval = (
    toolCallId: string,
    _toolName: string,
    _input: unknown,
  ): Promise<{ decision: 'allow' | 'deny'; remember: boolean }> =>
    new Promise((resolve) => {
      pendingApprovals.set(`${streamId}:${toolCallId}`, resolve);
    });

  const meta: LifecycleMeta = { streamId, chatId, assistantMessageId: assistantMsgId };
  let startedEmitted = false;

  (async () => {
    try {
      const currentSettings = settingsService.getSettings();

      const history = chatService.listMessages(chatId);
      const lastAssistant = [...history]
        .reverse()
        .find((m) => m.role === 'assistant' && m.usage != null);
      const currentContextTokens =
        devOverrides.getOverride<number>('forcedContextTokens') ??
        lastAssistant?.usage?.inputTokens ??
        Math.ceil(
          history.reduce((acc, m) => {
            for (const p of m.parts) {
              if (p.type === 'text') acc += p.text.length;
            }
            return acc;
          }, 0) / 4,
        );
      const contextWindow = model.capabilities.contextWindow ?? 200_000;
      const compactionRatio = devOverrides.getOverride<number>('compactionRatio') ?? 0.8;
      if (currentContextTokens > contextWindow * compactionRatio) {
        emitChunk({ kind: 'compacting', active: true });
        try {
          await compactionService.compact(chatId, model, apiKey, {
            signal: controller.signal,
            timeoutMs: currentSettings.requestTimeoutMs,
          });
        } catch (err) {
          log.error('Context compaction failed (non-fatal)', err);
        } finally {
          emitChunk({ kind: 'compacting', active: false });
        }
      }
      const snapshot = compactionService.getLatestSnapshot(chatId);

      const { parts, usage, stopReason } = await runStream({
        model,
        apiKey,
        project,
        history,
        snapshot,
        thinking,
        webSearch,
        effort,
        sliceTitles: { global: globalSliceTitles, project: projectSliceTitles },
        projectFileNames,
        getToolGrant: (name) => grants[name],
        setToolGrant: (name, decision) => {
          grants[name] = decision;
          chatService.updateChat(chatId, { composer: { toolGrants: grants } });
        },
        signal: controller.signal,
        onChunk: (chunk: StreamChunk) => {
          emitChunk(chunk);
          if (
            !startedEmitted &&
            (chunk.kind === 'text-delta' || chunk.kind === 'reasoning-delta')
          ) {
            startedEmitted = true;
            opts?.onLifecycle?.('started', meta);
          }
        },
        awaitApproval,
        maxRetries: currentSettings.maxRetries,
        requestTimeoutMs: currentSettings.requestTimeoutMs,
        resolveAttachment: (id) => {
          const a = attachmentService.getAttachmentBytes(id);
          return a
            ? { dataBase64: a.bytes.toString('base64'), mediaType: a.mediaType, kind: a.kind }
            : undefined;
        },
      });

      const saved =
        stopReason && parts.length === 0
          ? undefined
          : chatService.saveAssistantMessage(chatId, modelId, parts, usage, stopReason);
      opts?.onLifecycle?.('done', meta);
      emitChunk({ kind: 'done', message: saved });

      try {
        const history = chatService.listMessages(chatId);
        const chat = chatService.getChat(chatId);
        if (history.length === 2 && chat?.title === 'New Chat' && originalContent) {
          // Title generation routes to the chat's own provider, reusing the key
          // already loaded for the stream. The model is resolved per-provider
          // (cheapest enabled, or the user's pinned pick) and self-heals dead ids.
          const titleModelId = resolveTitleModel(model.provider);
          if (titleModelId) {
            const title = await generateChatTitle(
              originalContent,
              model.provider,
              apiKey,
              titleModelId,
            );
            if (title) {
              chatService.updateChat(chatId, { title });
              pushChatsUpdated();
            }
          }
        }
      } catch (err) {
        log.error('Title generation failed (non-fatal)', err);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emitChunk({ kind: 'error', error });
      opts?.onLifecycle?.('error', meta);
    } finally {
      settlePendingApprovals(streamId);
      activeStreams.delete(streamId);
    }
  })();

  return assistantMsgId;
}

export function startChatStream(
  input: SendMessageInput,
  opts?: StartChatStreamOpts,
): StartChatStreamResult {
  const userMsg = chatService.createUserMessage(input);
  const streamId = randomUUID();
  const controller = new AbortController();
  activeStreams.set(streamId, controller);

  const emitChunk = (chunk: StreamChunk) => {
    sendToWebview?.({ streamId, chunk });
    opts?.onChunk?.(chunk);
  };

  const assistantMessageId = runStreamForChat(
    {
      chatId: input.chatId,
      modelId: input.modelId,
      thinking: input.thinking ?? false,
      webSearch: input.webSearch ?? false,
      effort: input.effort ?? null,
      originalContent: input.content,
    },
    streamId,
    controller,
    emitChunk,
    opts,
  );

  return { streamId, userMessageId: userMsg.id, assistantMessageId };
}

export function retryChatStream(
  input: RetryMessageInput,
  opts?: StartChatStreamOpts,
): { streamId: string; assistantMessageId: string } {
  if (input.content != null) {
    chatService.updateUserMessageText(input.userMessageId, input.content);
  }
  chatService.truncateMessagesAfter(input.chatId, input.userMessageId);

  const streamId = randomUUID();
  const controller = new AbortController();
  activeStreams.set(streamId, controller);

  const emitChunk = (chunk: StreamChunk) => {
    sendToWebview?.({ streamId, chunk });
    opts?.onChunk?.(chunk);
  };

  const assistantMessageId = runStreamForChat(
    {
      chatId: input.chatId,
      modelId: input.modelId,
      thinking: input.thinking ?? false,
      webSearch: input.webSearch ?? false,
      effort: input.effort ?? null,
    },
    streamId,
    controller,
    emitChunk,
    opts,
  );

  return { streamId, assistantMessageId };
}

export function cancelStream(streamId: string): void {
  settlePendingApprovals(streamId);
  activeStreams.get(streamId)?.abort(new DOMException('user-cancel', 'AbortError'));
  activeStreams.delete(streamId);
}

export function resolveToolApproval(
  streamId: string,
  toolCallId: string,
  decision: 'allow' | 'deny',
  remember: boolean,
): void {
  const key = `${streamId}:${toolCallId}`;
  const resolve = pendingApprovals.get(key);
  if (resolve) {
    pendingApprovals.delete(key);
    resolve({ decision, remember });
  }
}
