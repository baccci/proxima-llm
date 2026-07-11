import { BrowserView, type RPCSchema, Utils } from 'electrobun/bun';
import { ProviderId } from '../../shared-contracts/providers/registry';
import type { AppRPC } from '../../shared-contracts/rpc/app-rpc.types';
import type { MemoryScope } from '../../shared-contracts/schemas/memory-slice.schema';
import { RetryMessageInput, SendMessageInput } from '../../shared-contracts/schemas/message.schema';
import { resolveApproval } from '../engine/chat-stream/approval-registry';
import {
  cancelStream,
  retryChatStream,
  startChatStream,
} from '../engine/chat-stream/chat-stream.service';
import * as compactionService from '../engine/compaction.service';
import * as attachmentService from '../features/attachment/attachment.repository';
import * as chatService from '../features/chat/chat.repository';
import { getLatestSnapshot } from '../features/compaction/compaction.repository';
import * as devOverridesService from '../features/dev-overrides/dev-overrides.service';
import * as logsService from '../features/logs/logs.service';
import * as memoryService from '../features/memory/memory.repository';
import * as memoryNotify from '../features/memory/memory-notify';
import * as modelService from '../features/model/model.repository';
import { getLastSyncTimestamp, syncOpenRouterModels } from '../features/model/model-sync.service';
import * as projectService from '../features/project/project.repository';
import * as projectFileService from '../features/project-file/project-file.repository';
import * as settingsService from '../features/settings/settings.repository';
import * as toolPermissionService from '../features/tool-permission/tool-permission.repository';
import * as keychain from '../infra/keychain';
import * as controlAuth from './control-server/auth';

type AppRPCTyped = {
  bun: RPCSchema<AppRPC['bun']>;
  webview: RPCSchema<AppRPC['webview']>;
};

// Max wall-clock a single RPC handler may run before the bridge times out.
const RPC_MAX_REQUEST_MS = 60_000;
// Dev tools gate: the launch env TWEAK=1 enables them; every dev handler is a
// no-op otherwise. Set at launch, never mutated, so it's read once here.
const DEV_TOOLS_ENABLED = process.env.TWEAK === '1';

// Current chat selected in the renderer; used by control server for target:"active"
let activeChatId: string | null = null;

export function getActiveChatId(): string | null {
  return activeChatId;
}

let sendModelsUpdated: (() => void) | null = null;
let sendControlNavigate: ((msg: AppRPC['webview']['messages']['controlNavigate']) => void) | null =
  null;

export function setSendModelsUpdated(fn: () => void): void {
  sendModelsUpdated = fn;
}

export function pushModelsUpdated(): void {
  sendModelsUpdated?.();
}

export function setSendControlNavigate(fn: typeof sendControlNavigate): void {
  sendControlNavigate = fn;
}

export function pushControlNavigate(msg: AppRPC['webview']['messages']['controlNavigate']): void {
  sendControlNavigate?.(msg);
}

export function setSendMemoryChanged(
  fn: (scope: MemoryScope, projectId: string | null) => void,
): void {
  memoryNotify.setMemoryChangedPush(fn);
}

// Lazy import — control server module is only used when it exists.
// We use dynamic require to avoid circular deps with the conditional boot path.
let _startServer: ((port: number) => void) | null = null;
let _stopServer: (() => void) | null = null;

export function setControlServerFns(start: (port: number) => void, stop: () => void): void {
  _startServer = start;
  _stopServer = stop;
}

export function createRPC() {
  return BrowserView.defineRPC<AppRPCTyped>({
    maxRequestTime: RPC_MAX_REQUEST_MS,
    handlers: {
      requests: {
        // Models
        listModels: () => modelService.listModels(),
        updateModel: ({ id, ...patch }) => modelService.updateModel(id, patch),

        // Projects
        listProjects: () => projectService.listProjects(),
        createProject: (input) => projectService.createProject(input),
        updateProject: ({ id, ...patch }) => projectService.updateProject(id, patch),
        deleteProject: ({ id }) => {
          projectService.deleteProject(id);
        },

        // Memory slices
        listMemorySlices: ({ scope, projectId }) => memoryService.listSlices(scope, projectId),
        upsertMemorySlice: (input) => {
          const result = memoryService.upsertSlice(input);
          memoryNotify.notifyMemoryChanged(input.scope, input.projectId ?? null);
          return result;
        },
        deleteMemorySlice: ({ id }) => {
          const deleted = memoryService.deleteSlice(id);
          if (deleted) {
            memoryNotify.notifyMemoryChanged(deleted.scope, deleted.projectId);
          }
        },
        getMemorySummary: ({ projectId }) => ({
          summary: projectService.getMemorySummary(projectId),
        }),

        // Project files
        listProjectFiles: ({ projectId }) => projectFileService.listProjectFiles(projectId),
        addProjectFile: (input) => projectFileService.saveProjectFile(input),
        readProjectFile: ({ projectId, fileId }) =>
          projectFileService.readProjectFileText(projectId, fileId),
        deleteProjectFile: ({ id }) => {
          projectFileService.deleteProjectFile(id);
        },

        // Chats
        listChats: ({ projectId }) => chatService.listChats(projectId),
        createChat: (input) => chatService.createChat(input),
        updateChat: ({ id, ...patch }) => chatService.updateChat(id, patch),
        deleteChat: ({ id }) => {
          chatService.deleteChat(id);
        },

        // Messages
        listMessages: ({ chatId }) => chatService.listMessages(chatId),
        getCompactionInfo: ({ chatId }) => {
          const snapshot = getLatestSnapshot(chatId);
          return snapshot
            ? {
                coveredThroughAt: snapshot.coveredThroughAt,
                displayThroughAt: snapshot.displayThroughAt,
              }
            : null;
        },
        compactNow: ({ chatId }) => compactionService.compactChatNow(chatId),

        sendMessage: (input) => {
          return startChatStream(SendMessageInput.parse(input));
        },

        retryFromMessage: (input) => retryChatStream(RetryMessageInput.parse(input)),

        cancelStream: ({ streamId }) => {
          cancelStream(streamId);
        },

        resolveToolApproval: ({ streamId, toolCallId, decision, remember }) => {
          resolveApproval(streamId, toolCallId, decision, remember);
        },

        setActiveChat: ({ chatId }) => {
          activeChatId = chatId;
        },

        // Tool policies
        listToolPolicies: () => toolPermissionService.listPoliciesDetailed(),

        setToolPolicy: ({ toolName, policy }) => {
          toolPermissionService.setPolicy(toolName, policy);
        },

        syncModels: () => syncOpenRouterModels(pushModelsUpdated, true),
        getModelSyncInfo: () => ({ lastSyncAt: getLastSyncTimestamp() }),

        // Logs
        getLogInfo: () => logsService.getLogInfo(),
        openLogsFolder: () => {
          logsService.openLogsFolder();
        },
        openLogFile: () => {
          logsService.openLogFile();
        },
        clearLogs: () => {
          logsService.clearLogs();
        },
        logClientError: (input) => {
          logsService.logClientError(input);
        },

        // App
        quit: () => {
          Utils.quit();
        },

        // Dev tools — no-ops unless DEV_TOOLS_ENABLED
        devSetOverride: ({ key, value }) => {
          if (DEV_TOOLS_ENABLED) {
            devOverridesService.setOverride(key, value);
          }
        },
        devForceCompact: async ({ chatId }) => {
          if (!DEV_TOOLS_ENABLED) {
            return;
          }

          await compactionService.forceCompactChat(chatId);
        },

        // Attachments
        uploadAttachment: (input) => attachmentService.saveAttachment(input),

        getAttachment: (input) => attachmentService.getAttachmentView(input.id),

        // Settings
        getSettings: () => settingsService.getSettings(),
        updateSettings: (input) => {
          const prev = settingsService.getSettings();
          settingsService.updateSettings(input);
          if (
            input.controlServerEnabled !== undefined &&
            input.controlServerEnabled !== prev.controlServerEnabled
          ) {
            const s = settingsService.getSettings();
            if (s.controlServerEnabled) {
              _startServer?.(s.controlServerPort);
            } else {
              _stopServer?.();
            }
          }
        },
        // Webview sends provider as a raw wire string; narrow it to the known
        // provider set before it reaches the keychain.
        setApiKey: ({ provider, key }) => {
          keychain.setApiKey(ProviderId.parse(provider), key);
        },
        hasApiKey: ({ provider }) => ({
          configured: keychain.hasApiKey(ProviderId.parse(provider)),
        }),

        // Control server
        generatePairingCode: () => controlAuth.generatePairingCode(),
        listControlTokens: () => controlAuth.listTokens(),
        revokeControlToken: ({ token }) => {
          controlAuth.revokeToken(token);
        },
      },
      messages: {},
    },
  });
}
