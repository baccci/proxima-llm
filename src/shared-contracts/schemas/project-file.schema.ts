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

export const AddProjectFileInput = z.object({
  projectId: z.string(),
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
