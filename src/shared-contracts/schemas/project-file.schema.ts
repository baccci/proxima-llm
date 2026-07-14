import { z } from 'zod'

export const ProjectFileDTO = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  mediaType: z.string(),
  byteSize: z.number().int(),
  sha256: z.string(),
  relPath: z.string(),
  createdAt: z.string().datetime(),
})

export type ProjectFileDTO = z.infer<typeof ProjectFileDTO>

// Untrusted upload payload from the renderer. projectId is constrained to a uuid because
// it flows straight into the on-disk storage path: a value containing path separators
// would let a write escape the project files directory. Mirrors SaveAttachmentInput.
export const AddProjectFileInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  data: z.string(),
  mediaType: z.string(),
})

export type AddProjectFileInput = z.infer<typeof AddProjectFileInput>

export const ReadProjectFileInput = z.object({
  projectId: z.string(),
  fileId: z.string(),
})

export type ReadProjectFileInput = z.infer<typeof ReadProjectFileInput>
