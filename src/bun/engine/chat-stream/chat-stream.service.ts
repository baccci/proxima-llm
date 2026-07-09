import { randomUUID } from 'crypto';
import type { AppRPC, StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import type {
  MessageDTO,
  RetryMessageInput,
  SendMessageInput,
} from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import * as attachmentService from '../../features/attachment/attachment.repository';
import * as chatService from '../../features/chat/chat.repository';
import { getLatestSnapshot } from '../../features/compaction/compaction.repository';
import * as devOverrides from '../../features/dev-overrides/dev-overrides.service';
import * as memoryService from '../../features/memory/memory.repository';
import { getModel } from '../../features/model/model.repository';
import { generateChatTitle } from '../../features/model/title';
import { resolveTitleModel } from '../../features/model/title-model.service';
import * as projectService from '../../features/project/project.repository';
import * as projectFileService from '../../features/project-file/project-file.repository';
import * as settingsService from '../../features/settings/settings.repository';
import * as keychain from '../../infra/keychain';
import { log } from '../../infra/logging/logger';
import * as compactionService from '../compaction.service';
import { runStream } from '../stream/run';
import { awaitApproval, settlePendingApprovals } from './approval-registry';
import {
  DEFAULT_COMPACTION_RATIO,
  estimateContextTokens,
  exceedsCompactionThreshold,
} from './context-window';

// In-flight streams: streamId -> AbortController
export const activeStreams = new Map<string, AbortController>();

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

// Compact the chat's context in place when the estimate crosses the model's
// threshold. Non-fatal: a failed compaction just proceeds with full history.
async function maybeCompact(args: {
  chatId: string;
  model: ModelDTO;
  apiKey: string;
  history: MessageDTO[];
  requestTimeoutMs: number;
  signal: AbortSignal;
  emitChunk: (chunk: StreamChunk) => void;
}): Promise<void> {
  const tokens =
    devOverrides.getOverride<number>('forcedContextTokens') ?? estimateContextTokens(args.history);
  const ratio = devOverrides.getOverride<number>('compactionRatio') ?? DEFAULT_COMPACTION_RATIO;
  if (!exceedsCompactionThreshold(tokens, args.model, ratio)) {
    return;
  }

  args.emitChunk({ kind: 'compacting', active: true });
  try {
    await compactionService.compact(args.chatId, args.model, args.apiKey, {
      signal: args.signal,
      timeoutMs: args.requestTimeoutMs,
    });
  } catch (err) {
    log.error('Context compaction failed (non-fatal)', err);
  } finally {
    args.emitChunk({ kind: 'compacting', active: false });
  }
}

// Auto-name a fresh chat after its first exchange (one user + one assistant turn,
// still titled "New Chat"). Routes to the chat's own provider, reusing the key
// already loaded for the stream; the title model self-heals dead ids.
async function maybeAutoTitle(args: {
  chatId: string;
  model: ModelDTO;
  apiKey: string;
  originalContent?: string;
}): Promise<void> {
  const history = chatService.listMessages(args.chatId);
  const chat = chatService.getChat(args.chatId);
  if (history.length !== 2 || chat?.title !== 'New Chat' || !args.originalContent) {
    return;
  }

  const titleModelId = resolveTitleModel(args.model.provider);
  if (!titleModelId) {
    return;
  }

  const title = await generateChatTitle(
    args.originalContent,
    args.model.provider,
    args.apiKey,
    titleModelId,
  );
  if (title) {
    chatService.updateChat(args.chatId, { title });
    pushChatsUpdated();
  }
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
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const apiKey = keychain.getApiKey(model.provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${model.provider}`);
  }

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

  const gateApproval = (toolCallId: string, _toolName: string, _input: unknown) =>
    awaitApproval(streamId, toolCallId);

  const meta: LifecycleMeta = { streamId, chatId, assistantMessageId: assistantMsgId };
  let startedEmitted = false;

  (async () => {
    try {
      const currentSettings = settingsService.getSettings();
      const history = chatService.listMessages(chatId);

      await maybeCompact({
        chatId,
        model,
        apiKey,
        history,
        requestTimeoutMs: currentSettings.requestTimeoutMs,
        signal: controller.signal,
        emitChunk,
      });

      const snapshot = getLatestSnapshot(chatId);

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
        awaitApproval: gateApproval,
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
        await maybeAutoTitle({ chatId, model, apiKey, originalContent });
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
