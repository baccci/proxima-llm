import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import { isSilentTool } from '@shared/tools/tool-catalog'
import { formatBytes } from '@utils/format-bytes'
import { IconFileText } from '@/components/icons/icon-file-text'
import { useAttachment } from '@/features/chat/attachment.api'
import { ToolCallBlock } from '@/features/chat/components/tool-call-block'
import { Markdown } from '@/lib/markdown'

type MessagePartRendererProps = {
  part: MessagePart
  streaming?: boolean
  textClassName?: string
  allParts?: MessagePart[]
}

type ImagePartRendererProps = {
  attachmentId: string
}

type FilePartRendererProps = {
  attachmentId: string
}

function ImagePartRenderer({ attachmentId }: ImagePartRendererProps) {
  const { data, isLoading } = useAttachment(attachmentId)

  if (isLoading) {
    return (
      <div className="my-2 rounded-card overflow-hidden border border-border max-w-sm">
        <div className="bg-surface animate-pulse h-32" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="my-2 rounded-card overflow-hidden border border-border max-w-sm">
        <div className="bg-surface p-3 text-xs text-subtle font-mono">[image unavailable]</div>
      </div>
    )
  }

  return (
    <div className="my-2 rounded-card overflow-hidden border border-border max-w-sm">
      <img src={data.dataUrl} alt={data.name} className="w-full h-auto object-contain" />
    </div>
  )
}

function FilePartRenderer({ attachmentId }: FilePartRendererProps) {
  const { data, isLoading } = useAttachment(attachmentId)

  if (isLoading) {
    return (
      <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted animate-pulse">
        <div className="h-3 w-24 bg-surface-hover rounded" />
      </div>
    )
  }

  const name = data?.name ?? `${attachmentId.slice(0, 8)}…`
  const size = data ? formatBytes(data.byteSize) : null

  return (
    <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
      <IconFileText width={13} className="text-selected-foreground shrink-0" />
      <span className="truncate max-w-[160px]">{name}</span>
      {size !== null && <span className="text-subtle shrink-0 text-xs">{size}</span>}
    </div>
  )
}

export function MessagePartRenderer({
  part,
  streaming,
  textClassName = 'text-base leading-relaxed',
  allParts,
}: MessagePartRendererProps) {
  if (part.type === PartKind.enum.text) {
    return <Markdown content={part.text} streaming={streaming} className={textClassName} />
  }

  if (part.type === PartKind.enum.reasoning) {
    return null // Rendered separately by ThinkingBlock
  }

  if (part.type === PartKind.enum.image) {
    return <ImagePartRenderer attachmentId={part.attachmentId} />
  }

  if (part.type === PartKind.enum.file) {
    return <FilePartRenderer attachmentId={part.attachmentId} />
  }

  if (part.type === PartKind.enum['tool-call']) {
    if (isSilentTool(part.toolName)) {
      return null
    }
    const result = allParts?.find(
      (p): p is Extract<MessagePart, { type: 'tool-result' }> =>
        p.type === PartKind.enum['tool-result'] && p.toolCallId === part.toolCallId,
    )
    return <ToolCallBlock toolName={part.toolName} input={part.input} output={result?.output} />
  }

  if (part.type === PartKind.enum['tool-result']) {
    return null // Rendered inside the matching tool-call block above
  }

  if (part.type === PartKind.enum.source) {
    return null // Rendered separately by SourcesBlock
  }

  return null
}
