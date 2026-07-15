import { AttachmentChip } from '@/features/chat/components/attachment-chip'
import type { PendingAttachment } from '@/features/chat/hooks/use-pending-attachments'

type ComposerAttachmentRowProps = {
  pending: PendingAttachment[]
  chatId: string
  onRemove: (localId: string) => void
}

// Row of chips for attachments staged in the composer but not yet sent.
export function ComposerAttachmentRow({ pending, chatId, onRemove }: ComposerAttachmentRowProps) {
  if (pending.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {pending.map((att) => (
        <AttachmentChip
          key={att.localId}
          attachment={{
            id: att.localId,
            chatId,
            kind: att.kind,
            mediaType: att.mediaType,
            byteSize: att.byteSize,
            sha256: '',
            relPath: att.name,
            createdAt: new Date().toISOString(),
          }}
          onRemove={() => onRemove(att.localId)}
        />
      ))}
    </div>
  )
}
