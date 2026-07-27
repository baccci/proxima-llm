import { randomUUID } from 'crypto';
import type { AppRPC, StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import { STREAM_CHUNK_KIND } from '../../../shared-contracts/rpc/stream-chunk';
import { MemoryScope } from '../../../shared-contracts/schemas/memory-slice.schema';
import type {
  MessageDTO,
  RetryMessageInput,
  SendMessageInput,
} from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';
import type { ProjectDTO } from '../../../shared-contracts/schemas/project.schema';
import type { ToolDecision } from '../../../shared-contracts/tools/tool-policy';
import * as attachmentService from '../../features/attachment/attachment.repository';
import * as chatService from '../../features/chat/chat.repository';
import { getLatestSnapshot } from '../../features/compaction/compaction.repository';
import * as memoryService from '../../features/memory/memory.repository';
import { getModel } from '../../features/model/model.repository';
import { showTurnNotification } from '../../features/notifications/notification';
import { pushPlaySound } from '../../features/notifications/sound-push';
import { isWindowFocused } from '../../features/notifications/window-focus';
import * as projectService from '../../features/project/project.repository';
import * as projectFileService from '../../features/project-file/project-file.repository';
import * as settingsService from '../../features/settings/settings.repository';
import * as keychain from '../../infra/keychain';
import { toErrorMessage } from '../../utils/to-error';
import { dispatchStage } from '../lifecycle/dispatch';
import { LIFECYCLE_STAGE } from '../lifecycle/stages';
import type { ResolveAttachment } from '../stream/build-prompt';
import { runStream } from '../stream/run';
import { awaitApproval, settlePendingApprovals } from './approval-registry';

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
export type LifecycleMeta = {
  streamId: string;
  chatId: string;
  assistantMessageId: string;
};

export type StartChatStreamOpts = {
  onLifecycle?: (event: LifecycleEvent, meta: LifecycleMeta) => void;
  onChunk?: (chunk: StreamChunk) => void;
};

export type StartChatStreamResult = {
  streamId: string;
  userMessageId: string;
  assistantMessageId: string;
};

type LaunchTurnParams = {
  chatId: string;
  modelId: string;
  thinking: boolean;
  webSearch: boolean;
  effort?: string | null;
};

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

// Everything the prompt reads from the chat row: the saved tool grants, the
// project, and the memory slice titles plus file names the model can index.
type TurnContext = {
  grants: Record<string, ToolDecision>;
  project: ProjectDTO | null;
  globalSliceTitles: string[];
  projectSliceTitles: string[];
  projectFileNames: string[];
};

// The chat's project, or null when the chat doesn't belong to one.
function loadProject(projectId: string | null | undefined): ProjectDTO | null {
  if (!projectId) {
    return null;
  }

  return projectService.getProject(projectId) ?? null;
}

// Read the chat row once and gather what the turn needs from it. The prompt only
// wants slice titles, not their bodies. Project-scoped slices and files come along
// only when the chat is in a project.
function gatherTurnContext(chatId: string): TurnContext {
  const chatRow = chatService.getChat(chatId);
  // Copy the saved grants so the turn can mutate them and write them back.
  const grants = { ...(chatRow?.composer.toolGrants ?? {}) };
  const globalSliceTitles = memoryService.listSlices(MemoryScope.enum.global).map((s) => s.title);

  const project = loadProject(chatRow?.projectId);
  if (!project) {
    return {
      grants,
      project: null,
      globalSliceTitles,
      projectSliceTitles: [],
      projectFileNames: [],
    };
  }

  const projectSliceTitles = memoryService
    .listSlices(MemoryScope.enum.project, project.id)
    .map((s) => s.title);
  const projectFileNames = projectFileService.listProjectFiles(project.id).map((f) => f.name);

  return { grants, project, globalSliceTitles, projectSliceTitles, projectFileNames };
}

// Turn an attachment id into the base64 payload the stream engine hands the model,
// or undefined when the attachment is gone.
const toAttachmentPayload: ResolveAttachment = (id) => {
  const attachment = attachmentService.getAttachmentBytes(id);
  if (!attachment) {
    return undefined;
  }

  return {
    dataBase64: attachment.bytes.toString('base64'),
    mediaType: attachment.mediaType,
    kind: attachment.kind,
  };
};

/**
 * Shared setup for both send and retry. Resolves the model and its key first, so an
 * unknown model or missing key throws before the stream is registered and leaks
 * nothing. Then it registers the stream, wires the chunk sink, emits `start`,
 * gathers the turn's context, and fires the detached turn.
 *
 * @param params - the chat, model, and per-turn flags.
 * @returns the stream id and the assistant message id, both available synchronously
 *   while the turn itself keeps running in the background.
 */
function launchTurn(
  params: LaunchTurnParams,
  opts?: StartChatStreamOpts,
): { streamId: string; assistantMessageId: string } {
  const { chatId, modelId, thinking, webSearch, effort } = params;

  // Resolve model and key before registering, so a preflight failure throws without
  // leaving a dead entry in activeStreams.
  const { model, apiKey } = resolveModelAndKey(modelId);

  const streamId = randomUUID();
  const controller = new AbortController();
  activeStreams.set(streamId, controller);

  const emitChunk = (chunk: StreamChunk) => {
    sendToWebview?.({ streamId, chunk });
    opts?.onChunk?.(chunk);
  };

  const assistantMessageId = randomUUID();
  // Tell the window a reply is starting and hand it the id for an empty bubble.
  emitChunk({ kind: STREAM_CHUNK_KIND.start, assistantMessageId });

  const { grants, project, globalSliceTitles, projectSliceTitles, projectFileNames } =
    gatherTurnContext(chatId);

  const gateApproval = (toolCallId: string, _toolName: string, _input: unknown) =>
    awaitApproval(streamId, toolCallId);

  // Ids for the lifecycle callback; startedEmitted keeps 'started' firing only once.
  const meta: LifecycleMeta = { streamId, chatId, assistantMessageId };
  let startedEmitted = false;

  /**
   * The turn itself, run detached (fire-and-forget). The caller already holds the
   * assistant message id; progress arrives later as stream chunks. Every error is
   * caught and surfaced as an error chunk, and the finally always cleans up.
   */
  const runTurn = async (): Promise<void> => {
    try {
      const currentSettings = settingsService.getSettings();
      const history = chatService.listMessages(chatId);

      await dispatchStage(LIFECYCLE_STAGE.compaction, {
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
          if (chunk.kind === STREAM_CHUNK_KIND.toolApprovalRequest) {
            // Fire-and-forget so the approval cue never stalls the stream; dispatch is non-fatal,
            // so a disabled or failing hook cannot break chunk handling.
            void dispatchStage(LIFECYCLE_STAGE.approvalNeeded, {
              chatId,
              playSound: pushPlaySound,
            });
          }
        },
        awaitApproval: gateApproval,
        maxRetries: currentSettings.maxRetries,
        requestTimeoutMs: currentSettings.requestTimeoutMs,
        resolveAttachment: toAttachmentPayload,
      });

      // A stopped reply with no content isn't worth saving; keep everything else.
      const droppedEmpty = stopReason != null && parts.length === 0;
      let saved: MessageDTO | undefined;
      if (!droppedEmpty) {
        saved = chatService.saveAssistantMessage(chatId, modelId, parts, usage, stopReason);
      }

      opts?.onLifecycle?.('done', meta);
      emitChunk({ kind: STREAM_CHUNK_KIND.done, message: saved });

      await dispatchStage(LIFECYCLE_STAGE.turnDone, {
        chatId,
        chatTitle: chatService.getChat(chatId)?.title ?? 'Proxima',
        isWindowFocused,
        showNotification: showTurnNotification,
        playSound: pushPlaySound,
      });

      await dispatchStage(LIFECYCLE_STAGE.autoTitle, {
        chatId,
        model,
        apiKey,
        notifyChatsUpdated: pushChatsUpdated,
      });
    } catch (err) {
      const error = toErrorMessage(err);
      emitChunk({ kind: STREAM_CHUNK_KIND.error, error });
      await dispatchStage(LIFECYCLE_STAGE.turnError, { chatId, playSound: pushPlaySound });
      opts?.onLifecycle?.('error', meta);
    } finally {
      settlePendingApprovals(streamId);
      activeStreams.delete(streamId);
    }
  };

  void runTurn();

  return { streamId, assistantMessageId };
}

/**
 * Public entry for a brand-new message. Saves the user's message, then launches the
 * assistant turn. Auto-title runs inside the turn off the saved history, so no
 * message content needs threading through here.
 *
 * @returns the stream id plus both message ids, so the caller can render the user
 *   bubble and the pending assistant bubble right away.
 */
export function startChatStream(
  input: SendMessageInput,
  opts?: StartChatStreamOpts,
): StartChatStreamResult {
  const userMsg = chatService.createUserMessage(input);

  const { streamId, assistantMessageId } = launchTurn(
    {
      chatId: input.chatId,
      modelId: input.modelId,
      thinking: input.thinking ?? false,
      webSearch: input.webSearch ?? false,
      effort: input.effort ?? null,
    },
    opts,
  );

  return { streamId, userMessageId: userMsg.id, assistantMessageId };
}

/**
 * Public entry for a retry. Overwrites the user message text when it was edited,
 * drops every message after it, then launches a fresh turn. If the chat is still
 * unnamed, the turn's auto-title pass will name it from the first user message.
 *
 * @returns the stream id and the (new) assistant message id.
 */
export function retryChatStream(
  input: RetryMessageInput,
  opts?: StartChatStreamOpts,
): { streamId: string; assistantMessageId: string } {
  if (input.content != null) {
    chatService.updateUserMessageText(input.userMessageId, input.content);
  }
  chatService.truncateMessagesAfter(input.chatId, input.userMessageId);

  return launchTurn(
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

/**
 * Cancel an in-flight stream. Settles any pending tool approvals so the turn stops
 * waiting on the user, aborts the request, and drops the stream from the registry.
 */
export function cancelStream(streamId: string): void {
  settlePendingApprovals(streamId);
  activeStreams.get(streamId)?.abort(new DOMException('user-cancel', 'AbortError'));
  activeStreams.delete(streamId);
}
