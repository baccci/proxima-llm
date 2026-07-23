import { type AttachmentDTO, AttachmentKind } from '@shared/schemas/attachment.schema'
import { IconFileText } from '@/components/icons/icon-file-text'
import { IconImage } from '@/components/icons/icon-image'
import { IconX } from '@/components/icons/icon-x'

type AttachmentChipProps = {
  attachment: AttachmentDTO
  onRemove?: () => void
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const isImage = attachment.kind === AttachmentKind.enum.image
  const sizeKb = Math.round(attachment.byteSize / 1024)

  return (
    <div className="flex items-center gap-1.5 bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-muted max-w-[180px]">
      {isImage ? (
        <IconImage width={13} className="text-selected-foreground shrink-0" />
      ) : (
        <IconFileText width={13} className="text-selected-foreground shrink-0" />
      )}
      <span className="truncate flex-1">{attachment.relPath.split('/').pop()}</span>
      <span className="text-subtle shrink-0">{sizeKb}KB</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 text-subtle hover:text-foreground transition-colors cursor-pointer"
        >
          <IconX width={12} />
        </button>
      )}
    </div>
  )
}
