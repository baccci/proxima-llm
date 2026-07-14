import { randomUUID } from 'crypto';
import { DevOverrideKey } from '../../../shared-contracts/dev/dev-override-keys';
import type { AppRPC, StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import { STREAM_CHUNK_KIND } from '../../../shared-contracts/rpc/stream-chunk';
import { DEFAULT_CHAT_TITLE } from '../../../shared-contracts/schemas/chat.schema';
import { MemoryScope } from '../../../shared-contracts/schemas/memory-slice.schema';
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
// Two push channels into the window, injected at boot by index.ts. They start
// null because this module loads before the window exists.
let sendToWebview: ((chunk: AppRPC['webview']['messages']['streamChunk']) => void) | null = null;
let sendChatsUpdated: (() => void) | null = null;

// Boot injects the sender that pushes a stream chunk to the window.
export function setSendToWebview(fn: typeof sendToWebview): void {
  sendToWebview = fn;
}

// Boot injects the sender that tells the window the chat list changed.
export function setSendChatsUpdated(fn: () => void): void {
  sendChatsUpdated = fn;
}

// Nudge the window to refetch its chat list; a no-op until the sender is wired.
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
  // How many tokens the context holds now. A dev override can pin this for testing,
  // otherwise estimate it from the history.
  const tokens =
    devOverrides.getOverride<number>(DevOverrideKey.enum.forcedContextTokens) ??
    estimateContextTokens(args.history);
  // The fraction of the window at which we start compacting. A dev override can pin it too.
  const ratio =
    devOverrides.getOverride<number>(DevOverrideKey.enum.compactionRatio) ??
    DEFAULT_COMPACTION_RATIO;
  if (!exceedsCompactionThreshold(tokens, args.model, ratio)) {
    return;
  }

  // Show the "compacting" divider in the window; the finally below clears it.
  args.emitChunk({ kind: STREAM_CHUNK_KIND.compacting, active: true });
  try {
    await compactionService.compact(args.chatId, args.model, args.apiKey, {
      signal: args.signal,
      timeoutMs: args.requestTimeoutMs,
    });
  } catch (err) {
    log.error('Context compaction failed (non-fatal)', err);
  } finally {
    args.emitChunk({ kind: STREAM_CHUNK_KIND.compacting, active: false });
  }
}

// A freshly answered chat holds exactly one user turn plus one assistant reply.
const FIRST_EXCHANGE_MESSAGE_COUNT = 2;

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
  // Only name the very first exchange, and only while it still has the default title.
  if (
    history.length !== FIRST_EXCHANGE_MESSAGE_COUNT ||
    chat?.title !== DEFAULT_CHAT_TITLE ||
    !args.originalContent
  ) {
    return;
  }

  // Pick a cheap title model on the chat's provider; skip titling if none fits.
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

// Resolve the model and its API key up front, or throw. Returns non-null values,
// so the turn body doesn't have to lean on control-flow narrowing from guards.
function resolveModelAndKey(modelId: string): { model: ModelDTO; apiKey: string } {
  const model = getModel(modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }

  const apiKey = keychain.getApiKey(model.provider);
  if (!apiKey) {
    throw new Error(`No API key configured for ${model.provider}`);
  }

  return { model, apiKey };
}

function runStreamForChat(
  params: RunStreamForChatParams,
  streamId: string,
  controller: AbortController,
  emitChunk: (chunk: StreamChunk) => void,
  opts?: StartChatStreamOpts,
): string {
  const { chatId, modelId, thinking, webSearch, effort, originalContent } = params;

  // Look up the model and its key up front; either being missing throws here.
  const { model, apiKey } = resolveModelAndKey(modelId);

  const assistantMsgId = randomUUID();
  // Tell the window a reply is starting and hand it the id for an empty bubble.
  emitChunk({ kind: STREAM_CHUNK_KIND.start, assistantMessageId: assistantMsgId });

  // Read the chat row once; it carries the saved tool grants and the project link.
  const chatRow = chatService.getChat(chatId);
  // Start from a copy of the saved grants, so the turn can mutate them and write them back.
  const grants = { ...(chatRow?.composer.toolGrants ?? {}) };
  const project = chatRow?.projectId
    ? (projectService.getProject(chatRow.projectId) ?? null)
    : null;

  // The prompt only needs memory slice titles, not their bodies. Global scope first.
  const globalSliceTitles = memoryService.listSlices(MemoryScope.enum.global).map((s) => s.title);

  // Then the project's own slices, when this chat belongs to a project.
  const projectSliceTitles = project
    ? memoryService.listSlices(MemoryScope.enum.project, project.id).map((s) => s.title)
    : [];
  const projectFileNames = project
    ? projectFileService.listProjectFiles(project.id).map((f) => f.name)
    : [];

  const gateApproval = (toolCallId: string, _toolName: string, _input: unknown) =>
    awaitApproval(streamId, toolCallId);

  // Ids for the lifecycle callback; startedEmitted keeps 'started' firing only once.
  const meta: LifecycleMeta = { streamId, chatId, assistantMessageId: assistantMsgId };
  let startedEmitted = false;

  // The turn itself runs detached (fire-and-forget): the caller already has the
  // assistant message id, and progress arrives later as stream chunks.
  const runTurn = async (): Promise<void> => {
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

      // The one call into the stream engine: it produces and streams the reply.
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
            (chunk.kind === STREAM_CHUNK_KIND.textDelta ||
              chunk.kind === STREAM_CHUNK_KIND.reasoningDelta)
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

      // A stopped reply with no content isn't worth saving; otherwise persist it.
      const saved =
        stopReason && parts.length === 0
          ? undefined
          : chatService.saveAssistantMessage(chatId, modelId, parts, usage, stopReason);
      opts?.onLifecycle?.('done', meta);
      emitChunk({ kind: STREAM_CHUNK_KIND.done, message: saved });

      try {
        await maybeAutoTitle({ chatId, model, apiKey, originalContent });
      } catch (err) {
        log.error('Title generation failed (non-fatal)', err);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      emitChunk({ kind: STREAM_CHUNK_KIND.error, error });
      opts?.onLifecycle?.('error', meta);
    } finally {
      settlePendingApprovals(streamId);
      activeStreams.delete(streamId);
    }
  };

  void runTurn();

  return assistantMsgId;
}

// Register a fresh stream and kick off its turn. Both send and retry share this:
// mint the streamId + AbortController, wire the chunk sink, then run the turn.
function launch(
  params: RunStreamForChatParams,
  opts?: StartChatStreamOpts,
): { streamId: string; assistantMessageId: string } {
  const streamId = randomUUID();
  const controller = new AbortController();
  activeStreams.set(streamId, controller);

  const emitChunk = (chunk: StreamChunk) => {
    sendToWebview?.({ streamId, chunk });
    opts?.onChunk?.(chunk);
  };

  const assistantMessageId = runStreamForChat(params, streamId, controller, emitChunk, opts);

  return { streamId, assistantMessageId };
}

export function startChatStream(
  input: SendMessageInput,
  opts?: StartChatStreamOpts,
): StartChatStreamResult {
  const userMsg = chatService.createUserMessage(input);

  const { streamId, assistantMessageId } = launch(
    {
      chatId: input.chatId,
      modelId: input.modelId,
      thinking: input.thinking ?? false,
      webSearch: input.webSearch ?? false,
      effort: input.effort ?? null,
      originalContent: input.content,
    },
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

  // No originalContent, so a retried turn never triggers auto-title.
  return launch(
    {
      chatId: input.chatId,
      modelId: input.modelId,
      thinking: input.thinking ?? false,
      webSearch: input.webSearch ?? false,
      effort: input.effort ?? null,
    },
    opts,
  );
}

export function cancelStream(streamId: string): void {
  settlePendingApprovals(streamId);
  activeStreams.get(streamId)?.abort(new DOMException('user-cancel', 'AbortError'));
  activeStreams.delete(streamId);
}
