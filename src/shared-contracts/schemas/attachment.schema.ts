import { z } from 'zod'

// Whether an attachment is a viewable image or an opaque file. Compare with
// AttachmentKind.enum.image. Persisted as literal text, so a rename is a DB migration.
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
