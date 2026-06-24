import { randomUUID } from 'crypto';
import type {
  AppRPC,
  SendMessageInput,
  StreamChunk,
} from '../../shared-contracts/rpc/app-rpc.types';
import { runStream } from '../llm/stream';
import { generateChatTitle } from '../llm/title';
import * as keychain from '../secrets/keychain';
import * as attachmentService from './attachment.service';
import * as chatService from './chat.service';
import { getModel } from './model.service';
import * as projectService from './project.service';
import * as settingsService from './settings.service';

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

  const model = getModel(input.modelId);
  if (!model) throw new Error(`Unknown model: ${input.modelId}`);

  const apiKey = keychain.getApiKey(model.provider);
  if (!apiKey) throw new Error(`No API key configured for ${model.provider}`);

  const assistantMsgId = randomUUID();
  emitChunk({ kind: 'start', assistantMessageId: assistantMsgId });

  const chatRow = chatService.getChat(input.chatId);
  const grants = { ...(chatRow?.composer.toolGrants ?? {}) };
  const project = chatRow?.projectId
    ? (projectService.getProject(chatRow.projectId) ?? null)
    : null;

  const awaitApproval = (
    toolCallId: string,
    _toolName: string,
    _input: unknown,
  ): Promise<{ decision: 'allow' | 'deny'; remember: boolean }> =>
    new Promise((resolve) => {
      pendingApprovals.set(`${streamId}:${toolCallId}`, resolve);
    });

  const meta: LifecycleMeta = {
    streamId,
    chatId: input.chatId,
    assistantMessageId: assistantMsgId,
  };
  let startedEmitted = false;

  (async () => {
    try {
      const currentSettings = settingsService.getSettings();
      const { parts, usage, stopReason } = await runStream({
        model,
        apiKey,
        project,
        history: chatService.listMessages(input.chatId),
        thinking: input.thinking ?? false,
        webSearch: input.webSearch ?? false,
        getToolGrant: (name) => grants[name],
        setToolGrant: (name, decision) => {
          grants[name] = decision;
          chatService.updateChat(input.chatId, { composer: { toolGrants: grants } });
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
          : chatService.saveAssistantMessage(input.chatId, input.modelId, parts, usage, stopReason);
      opts?.onLifecycle?.('done', meta);
      emitChunk({ kind: 'done', message: saved });

      try {
        const history = chatService.listMessages(input.chatId);
        const chat = chatService.getChat(input.chatId);
        if (history.length === 2 && chat?.title === 'New Chat') {
          const anthropicKey = keychain.getApiKey('anthropic');
          const [titleProvider, titleApiKey] = anthropicKey
            ? ['anthropic', anthropicKey]
            : [model.provider, apiKey];
          const title = await generateChatTitle(input.content, titleProvider, titleApiKey);
          if (title) {
            chatService.updateChat(input.chatId, { title });
            pushChatsUpdated();
          }
        }
      } catch (err) {
        console.error('Title generation failed (non-fatal):', err);
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

  return { streamId, userMessageId: userMsg.id, assistantMessageId: assistantMsgId };
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
