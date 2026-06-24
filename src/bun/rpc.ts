import { BrowserView, type RPCSchema, Utils } from 'electrobun/bun';
import type { AppRPC } from '../shared-contracts/rpc/app-rpc.types';
import { TOOL_CATALOG } from '../shared-contracts/tools/tool-catalog';
import * as controlAuth from './control-server/auth';
import * as keychain from './secrets/keychain';
import * as attachmentService from './services/attachment.service';
import * as chatService from './services/chat.service';
import { cancelStream, resolveToolApproval, startChatStream } from './services/chat-stream.service';
import * as modelService from './services/model.service';
import { getLastSyncTimestamp, syncOpenRouterModels } from './services/model-sync.service';
import * as projectService from './services/project.service';
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
        createModel: (input) => modelService.createModel(input),
        updateModel: ({ id, ...patch }) => modelService.updateModel(id, patch),
        deleteModel: ({ id }) => {
          modelService.deleteModel(id);
        },

        // Projects
        listProjects: () => projectService.listProjects(),
        createProject: (input) => projectService.createProject(input),
        updateProject: ({ id, ...patch }) => projectService.updateProject(id, patch),
        deleteProject: ({ id }) => {
          projectService.deleteProject(id);
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

        sendMessage: (input) => {
          return startChatStream(input);
        },

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

        // App
        quit: () => {
          Utils.quit();
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
        setApiKey: ({ provider, key }) => {
          keychain.setApiKey(provider, key);
        },
        hasApiKey: ({ provider }) => ({ configured: keychain.hasApiKey(provider) }),

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
