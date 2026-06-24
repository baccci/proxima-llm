import type { MessagePart } from '@shared/schemas/message.schema'
import { IconFileText } from '@/components/icons/icon-file-text'
import { useAttachment } from '@/features/chat/attachment.api'
import { ToolCallBlock } from '@/features/chat/components/tool-call-block'
import { Markdown } from '@/lib/markdown'

interface PartProps {
  part: MessagePart
  streaming?: boolean
  textClassName?: string
  allParts?: MessagePart[]
}

function ImagePartRenderer({ attachmentId }: { attachmentId: string }) {
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

function FilePartRenderer({ attachmentId }: { attachmentId: string }) {
  const { data, isLoading } = useAttachment(attachmentId)

  if (isLoading) {
    return (
      <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted animate-pulse">
        <div className="h-3 w-24 bg-surface-hover rounded" />
      </div>
    )
  }

  const name = data?.name ?? `${attachmentId.slice(0, 8)}…`
  const sizeKb = data ? Math.round(data.byteSize / 1024) : null

  return (
    <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted">
      <IconFileText width={13} className="text-accent-400 shrink-0" />
      <span className="truncate max-w-[160px]">{name}</span>
      {sizeKb !== null && <span className="text-subtle shrink-0 text-xs">{sizeKb}KB</span>}
    </div>
  )
}

export function MessagePartRenderer({
  part,
  streaming,
  textClassName = 'text-base leading-relaxed',
  allParts,
}: PartProps) {
  if (part.type === 'text') {
    return <Markdown content={part.text} streaming={streaming} className={textClassName} />
  }

  if (part.type === 'reasoning') {
    return null // Rendered separately by ThinkingBlock
  }

  if (part.type === 'image') {
    return <ImagePartRenderer attachmentId={part.attachmentId} />
  }

  if (part.type === 'file') {
    return <FilePartRenderer attachmentId={part.attachmentId} />
  }

  if (part.type === 'tool-call') {
    const result = allParts?.find(
      (p): p is Extract<MessagePart, { type: 'tool-result' }> =>
        p.type === 'tool-result' && p.toolCallId === part.toolCallId,
    )
    return <ToolCallBlock toolName={part.toolName} input={part.input} output={result?.output} />
  }

  if (part.type === 'tool-result') {
    return null // Rendered inside the matching tool-call block above
  }

  if (part.type === 'source') {
    return null // Rendered separately by SourcesBlock
  }

  return null
}

export function extractReasoning(parts: MessagePart[]): string | null {
  const p = parts.find((p) => p.type === 'reasoning')
  return p?.type === 'reasoning' ? p.text : null
}

export function extractReasoningPart(
  parts: MessagePart[],
): Extract<MessagePart, { type: 'reasoning' }> | null {
  const p = parts.find((p) => p.type === 'reasoning')
  return p?.type === 'reasoning' ? p : null
}

export function extractTextParts(parts: MessagePart[]): MessagePart[] {
  return parts.filter((p) => p.type !== 'reasoning' && p.type !== 'source')
}

export function extractSourceParts(
  parts: MessagePart[],
): Extract<MessagePart, { type: 'source' }>[] {
  return parts.filter((p): p is Extract<MessagePart, { type: 'source' }> => p.type === 'source')
}
