import { AttachmentKind } from '@shared/schemas/attachment.schema'
import type { ModelDTO } from '@shared/schemas/model.schema'
import React from 'react'
import { supportsAttachment } from '@/entities/model/capabilities'
import { uploadAttachment } from '@/features/chat/attachment.api'

const MAX_BYTE_SIZE = 20 * 1024 * 1024

export type PendingAttachment = {
  localId: string
  file: File
  name: string
  mediaType: string
  byteSize: number
  kind: AttachmentKind
  serverId?: string
}

export function usePendingAttachments() {
  const [pending, setPending] = React.useState<PendingAttachment[]>([])
  const [attachError, setAttachError] = React.useState<string | null>(null)

  function addFiles(files: FileList | File[], model: ModelDTO | undefined) {
    setAttachError(null)
    const toAdd: PendingAttachment[] = []
    for (const file of Array.from(files)) {
      if (!model || !supportsAttachment(model, file.type)) {
        setAttachError(`${file.name}: unsupported type for this model`)
        continue
      }
      if (file.size > MAX_BYTE_SIZE) {
        setAttachError(`${file.name}: exceeds 20 MB limit`)
        continue
      }
      toAdd.push({
        localId: crypto.randomUUID(),
        file,
        name: file.name,
        mediaType: file.type,
        byteSize: file.size,
        kind: file.type.startsWith('image/') ? AttachmentKind.enum.image : AttachmentKind.enum.file,
      })
    }
    if (toAdd.length > 0) {
      setPending((prev) => [...prev, ...toAdd])
    }
  }

  function removeAttachment(localId: string) {
    setPending((prev) => prev.filter((a) => a.localId !== localId))
  }

  async function flush(chatId: string): Promise<string[]> {
    const snapshot = pending
    const serverIds: string[] = []
    const updated = [...snapshot]

    for (let i = 0; i < updated.length; i++) {
      const att = updated[i]
      if (att.serverId) {
        serverIds.push(att.serverId)
        continue
      }
      const dto = await uploadAttachment(chatId, att.file)
      updated[i] = { ...att, serverId: dto.id }
      serverIds.push(dto.id)
    }

    setPending(updated)
    return serverIds
  }

  function clear() {
    setPending([])
    setAttachError(null)
  }

  return { pending, attachError, addFiles, removeAttachment, flush, clear }
}
