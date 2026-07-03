import type { AttachmentDTO, AttachmentKind } from '../schemas/attachment.schema'
import type { ChatComposerState, ChatDTO, CreateChatInput } from '../schemas/chat.schema'
import type {
  DeleteMemorySliceInput,
  ListMemorySlicesInput,
  MemoryScope,
  MemorySliceDTO,
  UpsertMemorySliceInput,
} from '../schemas/memory-slice.schema'
import type { MessageDTO } from '../schemas/message.schema'
import type { ModelDTO } from '../schemas/model.schema'
import type { CreateProjectInput, ProjectDTO, UpdateProjectInput } from '../schemas/project.schema'
import type {
  AddProjectFileInput,
  ProjectFileDTO,
  ReadProjectFileInput,
} from '../schemas/project-file.schema'
import type { SettingsDTO, UpdateSettingsInput } from '../schemas/settings.schema'
import type { ToolDecision, ToolPolicy } from '../tools/tool-policy'

export type StreamChunk =
  | { kind: 'start'; assistantMessageId: string }
  | { kind: 'compacting'; active: boolean }
  | { kind: 'text-delta'; delta: string }
  | { kind: 'reasoning-delta'; delta: string }
  | { kind: 'source'; url: string; title?: string }
  | { kind: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { kind: 'tool-result'; toolCallId: string; output: unknown }
  | { kind: 'tool-approval-request'; toolCallId: string; toolName: string; input: unknown }
  | { kind: 'done'; message?: MessageDTO }
  | { kind: 'error'; error: string }

export type SendMessageInput = {
  chatId: string
  modelId: string
  content: string
  thinking?: boolean
  webSearch?: boolean
  effort?: string | null
  attachmentIds?: string[]
}

export type RetryMessageInput = {
  chatId: string
  modelId: string
  userMessageId: string
  content?: string
  thinking?: boolean
  webSearch?: boolean
  effort?: string | null
}

export type AppRPC = {
  bun: {
    requests: {
      // Models
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      listModels: { params: {}; response: ModelDTO[] }
      createModel: { params: Omit<ModelDTO, 'createdAt' | 'updatedAt'>; response: ModelDTO }
      updateModel: { params: Partial<ModelDTO> & { id: string }; response: ModelDTO }
      deleteModel: { params: { id: string }; response: void }

      // Projects
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      listProjects: { params: {}; response: ProjectDTO[] }
      createProject: { params: CreateProjectInput; response: ProjectDTO }
      updateProject: { params: UpdateProjectInput & { id: string }; response: ProjectDTO }
      deleteProject: { params: { id: string }; response: void }

      // Memory slices
      listMemorySlices: { params: ListMemorySlicesInput; response: MemorySliceDTO[] }
      upsertMemorySlice: { params: UpsertMemorySliceInput; response: MemorySliceDTO }
      deleteMemorySlice: { params: DeleteMemorySliceInput; response: void }
      getMemorySummary: { params: { projectId: string }; response: { summary: string | null } }

      // Project files
      listProjectFiles: { params: { projectId: string }; response: ProjectFileDTO[] }
      addProjectFile: { params: AddProjectFileInput; response: ProjectFileDTO }
      readProjectFile: { params: ReadProjectFileInput; response: string }
      deleteProjectFile: { params: { id: string }; response: void }

      // Chats
      listChats: { params: { projectId: string | null }; response: ChatDTO[] }
      createChat: { params: CreateChatInput; response: ChatDTO }
      updateChat: {
        params: {
          id: string
          title?: string
          pinned?: boolean
          modelId?: string
          composer?: Partial<ChatComposerState>
        }
        response: ChatDTO
      }
      deleteChat: { params: { id: string }; response: void }

      // Messages
      listMessages: { params: { chatId: string }; response: MessageDTO[] }
      getCompactionInfo: {
        params: { chatId: string }
        response: { coveredThroughAt: string; displayThroughAt: string } | null
      }
      compactNow: {
        params: { chatId: string }
        response:
          | { status: 'ok'; summarized: number }
          | { status: 'noop'; reason: 'nothing-to-summarize' | 'no-title-model' | 'empty-summary' }
      }
      sendMessage: {
        params: SendMessageInput
        response: { streamId: string; userMessageId: string; assistantMessageId: string }
      }
      retryFromMessage: {
        params: RetryMessageInput
        response: { streamId: string; assistantMessageId: string }
      }
      cancelStream: { params: { streamId: string }; response: void }
      resolveToolApproval: {
        params: {
          streamId: string
          toolCallId: string
          decision: ToolDecision
          remember: boolean
        }
        response: void
      }
      setActiveChat: { params: { chatId: string | null }; response: void }

      // Attachments
      uploadAttachment: {
        params: { chatId: string; name: string; data: string; mediaType: string }
        response: AttachmentDTO
      }
      getAttachment: {
        params: { id: string }
        response: {
          id: string
          kind: AttachmentKind
          mediaType: string
          name: string
          byteSize: number
          dataUrl: string
        }
      }

      // Settings
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      getSettings: { params: {}; response: SettingsDTO }
      updateSettings: { params: UpdateSettingsInput; response: void }
      setApiKey: { params: { provider: string; key: string }; response: void }
      hasApiKey: { params: { provider: string }; response: { configured: boolean } }

      // Tool policies
      listToolPolicies: {
        // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
        params: {}
        response: {
          name: string
          label: string
          description: string
          policy: ToolPolicy
        }[]
      }
      setToolPolicy: {
        params: { toolName: string; policy: ToolPolicy }
        response: void
      }

      // Control server
      generatePairingCode: {
        // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
        params: {}
        response: { code: string; expiresAt: string }
      }
      listControlTokens: {
        // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
        params: {}
        response: { token: string; label: string; createdAt: string; lastUsedAt: string | null }[]
      }
      revokeControlToken: { params: { token: string }; response: void }

      // Models sync
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      syncModels: { params: {}; response: void }
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      getModelSyncInfo: { params: {}; response: { lastSyncAt: number | null } }

      // Logs
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      getLogInfo: { params: {}; response: { dir: string; sizeBytes: number; fileCount: number } }
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      openLogsFolder: { params: {}; response: void }
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      openLogFile: { params: {}; response: void }
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      clearLogs: { params: {}; response: void }
      logClientError: {
        params: { msg: string; stack?: string; context?: Record<string, unknown> }
        response: void
      }

      // App
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      quit: { params: {}; response: void }

      // Dev tools (TWEAK=1 only — handlers are no-ops in prod)
      devSetOverride: {
        params: { key: string; value: number | string | boolean | null }
        response: void
      }
      devForceCompact: { params: { chatId: string }; response: void }
    }
    // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
    messages: {}
  }
  webview: {
    // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
    requests: {}
    messages: {
      streamChunk: { streamId: string; chunk: StreamChunk }
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      modelsUpdated: {}
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      chatsUpdated: {}
      memoryChanged: { scope: MemoryScope; projectId: string | null }
      controlNavigate: {
        chatId: string
        streamId: string
        assistantMessageId: string
        focus: boolean
      }
    }
  }
}
