import type { DevOverrideKey } from '../dev/dev-override-keys'
import type { HookDetailRow } from '../lifecycle/hook-catalog'
import type { SoundId } from '../lifecycle/sound'
import type { ProviderId } from '../providers/registry'
import type { AttachmentDTO, AttachmentKind } from '../schemas/attachment.schema'
import type { ChatComposerState, ChatDTO, CreateChatInput } from '../schemas/chat.schema'
import type {
  DeleteMemorySliceInput,
  ListMemorySlicesInput,
  MemoryScope,
  MemorySliceDTO,
  UpsertMemorySliceInput,
} from '../schemas/memory-slice.schema'
import type { MessageDTO, RetryMessageInput, SendMessageInput } from '../schemas/message.schema'
import type { ModelDTO } from '../schemas/model.schema'
import type { CreateProjectInput, ProjectDTO, UpdateProjectInput } from '../schemas/project.schema'
import type {
  AddProjectFileInput,
  ProjectFileDTO,
  ReadProjectFileInput,
} from '../schemas/project-file.schema'
import type { SettingsDTO, UpdateSettingsInput } from '../schemas/settings.schema'
import type { ToolDecision, ToolPolicy } from '../tools/tool-policy'
import type { CompactResult } from './compact-result'
import type { StreamChunk } from './stream-chunk'

export type { StreamChunk }

export type AppRPC = {
  bun: {
    requests: {
      // Models
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      listModels: { params: {}; response: ModelDTO[] }
      updateModel: { params: Partial<ModelDTO> & { id: string }; response: ModelDTO }

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
        response: CompactResult
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
      removeApiKey: { params: { provider: string }; response: void }

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

      // Lifecycle hooks (opt-in sounds / notifications)
      listHooks: {
        // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
        params: {}
        response: HookDetailRow[]
      }
      setHook: {
        params: { actionId: string; enabled: boolean }
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
      // Last-sync timestamp per syncable provider; a provider is absent until it syncs.
      // biome-ignore lint/complexity/noBannedTypes: required by electrobun RPC shape
      getModelSyncInfo: { params: {}; response: Partial<Record<ProviderId, number | null>> }

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
        params: { key: DevOverrideKey; value: number | string | boolean | null }
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
      playSound: { sound: SoundId }
    }
  }
}
