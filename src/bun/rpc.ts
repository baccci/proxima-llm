import { BrowserView, type RPCSchema, Utils } from 'electrobun/bun';
import { ProviderId } from '../shared-contracts/providers/registry';
import type { AppRPC } from '../shared-contracts/rpc/app-rpc.types';
import type { MemoryScope } from '../shared-contracts/schemas/memory-slice.schema';
import { RetryMessageInput, SendMessageInput } from '../shared-contracts/schemas/message.schema';
import { TOOL_CATALOG } from '../shared-contracts/tools/tool-catalog';
import * as controlAuth from './control-server/auth';
import * as keychain from './secrets/keychain';
import * as attachmentService from './services/attachment.service';
import * as chatService from './services/chat.service';
import {
  cancelStream,
  resolveToolApproval,
  retryChatStream,
  startChatStream,
} from './services/chat-stream.service';
import * as compactionService from './services/compaction.service';
import * as devOverridesService from './services/dev-overrides.service';
import * as logsService from './services/logs.service';
import * as memoryService from './services/memory.service';
import * as memorySummaryService from './services/memory-summary.service';
import * as modelService from './services/model.service';
import { getLastSyncTimestamp, syncOpenRouterModels } from './services/model-sync.service';
import * as projectService from './services/project.service';
import * as projectFileService from './services/project-file.service';
import * as settingsService from './services/settings.service';
import * as toolPermissionService from './services/tool-permission.service';

type AppRPCTyped = {
  bun: RPCSchema<AppRPC['bun']>;
  webview: RPCSchema<AppRPC['webview']>;
};

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
  memorySummaryService.setMemoryChangedPush(fn);
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
    maxRequestTime: 60_000,
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
          memorySummaryService.notifyMemoryChanged(input.scope, input.projectId ?? null);
          return result;
        },
        deleteMemorySlice: ({ id }) => {
          const deleted = memoryService.deleteSlice(id);
          if (deleted) memorySummaryService.notifyMemoryChanged(deleted.scope, deleted.projectId);
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
          const snapshot = compactionService.getLatestSnapshot(chatId);
          return snapshot
            ? {
                coveredThroughAt: snapshot.coveredThroughAt,
                displayThroughAt: snapshot.displayThroughAt,
              }
            : null;
        },
        compactNow: async ({ chatId }) => {
          const chat = chatService.getChat(chatId);
          if (!chat?.modelId) throw new Error('No model selected for chat');
          const model = modelService.getModel(chat.modelId);
          if (!model) throw new Error(`Unknown model: ${chat.modelId}`);
          const apiKey = keychain.getApiKey(model.provider);
          if (!apiKey) throw new Error(`No API key for ${model.provider}`);
          // Manual compaction keeps a smaller recent window than the auto pass, so
          // an explicit click reliably frees context. No-op only if there are fewer
          // than MANUAL_KEEP_RECENT messages past the last snapshot.
          const result = await compactionService.compact(chatId, model, apiKey, {
            keepRecent: compactionService.MANUAL_KEEP_RECENT,
          });
          return result;
        },

        sendMessage: (input) => {
          return startChatStream(SendMessageInput.parse(input));
        },

        retryFromMessage: (input) => retryChatStream(RetryMessageInput.parse(input)),

        cancelStream: ({ streamId }) => {
          cancelStream(streamId);
        },

        resolveToolApproval: ({ streamId, toolCallId, decision, remember }) => {
          resolveToolApproval(streamId, toolCallId, decision, remember);
        },

        setActiveChat: ({ chatId }) => {
          activeChatId = chatId;
        },

        // Tool policies
        listToolPolicies: () => {
          const policies = toolPermissionService.listPolicies();
          return TOOL_CATALOG.map((entry) => ({
            name: entry.name,
            label: entry.label,
            description: entry.description,
            policy: policies.find((p) => p.name === entry.name)?.policy ?? 'ask',
          }));
        },

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

        // Dev tools — no-ops unless process.env.TWEAK === '1'
        devSetOverride: ({ key, value }) => {
          if (process.env.TWEAK === '1') devOverridesService.setOverride(key, value);
        },
        devForceCompact: async ({ chatId }) => {
          if (process.env.TWEAK !== '1') return;
          const chat = chatService.getChat(chatId);
          if (!chat?.modelId) throw new Error('No model selected for chat');
          const model = modelService.getModel(chat.modelId);
          if (!model) throw new Error(`Unknown model: ${chat.modelId}`);
          const apiKey = keychain.getApiKey(model.provider);
          if (!apiKey) throw new Error(`No API key for ${model.provider}`);
          // keepRecent: 0 → summarize the whole chat so even a short test
          // conversation produces a snapshot (real auto-compaction keeps 15).
          await compactionService.compact(chatId, model, apiKey, { keepRecent: 0 });
        },

        // Attachments
        uploadAttachment: (input) => attachmentService.saveAttachment(input),

        getAttachment: (input) => {
          const att = attachmentService.getAttachment(input.id);
          if (!att) throw new Error(`Attachment not found: ${input.id}`);
          const bytes = attachmentService.getAttachmentBytes(input.id);
          if (!bytes) throw new Error(`Attachment file missing: ${input.id}`);
          const dataUrl = `data:${bytes.mediaType};base64,${bytes.bytes.toString('base64')}`;
          const name = att.relPath.split('/').pop() ?? att.id;
          return {
            id: att.id,
            kind: att.kind,
            mediaType: att.mediaType,
            name,
            byteSize: att.byteSize,
            dataUrl,
          };
        },

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
              _startServer?.(s.controlServerPort ?? 7865);
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
