import type { AttachmentKind } from '@shared/schemas/attachment.schema'
import { type MessageDTO, MessageRole, PartKind } from '@shared/schemas/message.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'
import type { ProjectDTO } from '@shared/schemas/project.schema'
import type { ModelMessage } from 'ai'
import type { CompactionSnapshot } from '../../features/compaction/compaction.repository'
import { buildBaseSystemPrompt, MEMORY_GUIDANCE } from '../../infra/llm/system-prompt'

export type ResolveAttachment = (
  id: string,
) => { dataBase64: string; mediaType: string; kind: AttachmentKind } | undefined

// Assemble the system prompt: base model prompt + project description + a memory
// index (titles the model can read on demand) + project file names + any earlier
// conversation summary from a compaction snapshot.
export function buildSystem(
  model: ModelDTO,
  project: ProjectDTO | null,
  webSearchActive: boolean,
  sliceTitles?: { global: string[]; project: string[] },
  projectFileNames?: string[],
  snapshot?: CompactionSnapshot,
): string {
  const parts: string[] = [buildBaseSystemPrompt(model, webSearchActive)]

  if (project?.description) {
    parts.push(project.description)
  }

  const globalTitles = sliceTitles?.global ?? []
  const projectTitles = sliceTitles?.project ?? []

  const memLines: string[] = [MEMORY_GUIDANCE]
  memLines.push(
    globalTitles.length > 0
      ? `Global notes: ${globalTitles.map((t) => `"${t}"`).join(', ')}`
      : 'Global notes: none saved yet.',
  )
  if (project != null) {
    memLines.push(
      projectTitles.length > 0
        ? `Project notes: ${projectTitles.map((t) => `"${t}"`).join(', ')}`
        : 'Project notes: none saved yet.',
    )
  }
  parts.push(memLines.join('\n'))

  const fileNames = projectFileNames ?? []
  if (project != null && fileNames.length > 0) {
    const lines: string[] = [
      '# Project files',
      'Files attached to this project. Read one with read_project_file when needed.',
      ...fileNames.map((n) => `- ${n}`),
    ]
    parts.push(lines.join('\n'))
  }

  if (snapshot?.summaryText) {
    parts.push(`## Earlier conversation summary\n${snapshot.summaryText}`)
  }

  return parts.join('\n\n')
}

type CoreTextPart = { type: 'text'; text: string }
type CoreImagePart = { type: 'image'; image: string; mediaType: string }
type CoreFilePart = { type: 'file'; data: string; mediaType: string }
type CoreToolCallPart = { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
type CoreToolResultPart = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  output: unknown
}

// Map stored chat history into the provider's message format. Drops system
// messages, resolves image/file attachments to bytes, and, critically,
// backfills a synthetic 'interrupted' tool-result for any assistant tool-call
// that never got one (a cancelled run), so the provider payload is never left
// with a dangling tool-call it would reject.
export function toCoreMessages(
  history: MessageDTO[],
  resolveAttachment: ResolveAttachment,
  snapshot?: CompactionSnapshot,
): ModelMessage[] {
  const result: ModelMessage[] = []
  const filtered = snapshot
    ? history.filter((m) => m.createdAt > snapshot.coveredThroughAt)
    : history

  for (const m of filtered) {
    if (m.role === MessageRole.enum.system) {
      continue
    }

    if (m.role === MessageRole.enum.user) {
      const content: Array<CoreTextPart | CoreImagePart | CoreFilePart> = []
      for (const p of m.parts) {
        if (p.type === PartKind.enum.text) {
          content.push({ type: 'text', text: p.text })
        } else if (p.type === PartKind.enum.image) {
          const resolved = resolveAttachment(p.attachmentId)
          if (resolved) {
            content.push({
              type: 'image',
              image: resolved.dataBase64,
              mediaType: resolved.mediaType,
            })
          } else {
            content.push({ type: 'text', text: '[missing attachment]' })
          }
        } else if (p.type === PartKind.enum.file) {
          const resolved = resolveAttachment(p.attachmentId)
          if (resolved) {
            content.push({
              type: 'file',
              data: resolved.dataBase64,
              mediaType: resolved.mediaType,
            })
          } else {
            content.push({ type: 'text', text: '[missing attachment]' })
          }
        }
      }
      result.push({ role: 'user', content } as ModelMessage)
      continue
    }

    if (m.role === MessageRole.enum.assistant) {
      const assistantContent: Array<CoreTextPart | CoreToolCallPart> = []
      const toolResults: CoreToolResultPart[] = []

      for (const p of m.parts) {
        if (p.type === PartKind.enum.text || p.type === PartKind.enum.reasoning) {
          assistantContent.push({ type: 'text', text: p.text })
        } else if (p.type === PartKind.enum['tool-call']) {
          assistantContent.push({
            type: 'tool-call',
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            input: p.input,
          })
        } else if (p.type === PartKind.enum['tool-result']) {
          toolResults.push({
            type: 'tool-result',
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            output: { type: 'json', value: p.output },
          })
        }
      }

      const resolvedIds = new Set(toolResults.map((r) => r.toolCallId))
      for (const p of assistantContent) {
        if (p.type === 'tool-call' && !resolvedIds.has(p.toolCallId)) {
          toolResults.push({
            type: 'tool-result',
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            output: { type: 'json', value: { interrupted: true } },
          })
        }
      }

      if (assistantContent.length > 0 || toolResults.length === 0) {
        result.push({ role: 'assistant', content: assistantContent } as ModelMessage)
      }
      if (toolResults.length > 0) {
        result.push({ role: 'tool', content: toolResults } as ModelMessage)
      }
    }
  }

  return result
}
