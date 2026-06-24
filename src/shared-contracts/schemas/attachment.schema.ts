import { z } from 'zod'

export const AttachmentKind = z.enum(['image', 'file'])
export type AttachmentKind = z.infer<typeof AttachmentKind>

export const AttachmentDTO = z.object({
  id: z.string(),
  chatId: z.string(),
  kind: AttachmentKind,
  mediaType: z.string(),
  byteSize: z.number().int(),
  sha256: z.string(),
  relPath: z.string(),
  createdAt: z.string().datetime(),
})

export type AttachmentDTO = z.infer<typeof AttachmentDTO>
