import { z } from 'zod'

export const MemoryScope = z.enum(['global', 'project'])
export type MemoryScope = z.infer<typeof MemoryScope>

export const MemorySource = z.enum(['user', 'model'])
export type MemorySource = z.infer<typeof MemorySource>

export const MemorySliceDTO = z.object({
  id: z.string(),
  scope: MemoryScope,
  projectId: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  source: MemorySource,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type MemorySliceDTO = z.infer<typeof MemorySliceDTO>

export const ListMemorySlicesInput = z.object({
  scope: MemoryScope,
  projectId: z.string().nullable().optional(),
})

export type ListMemorySlicesInput = z.infer<typeof ListMemorySlicesInput>

export const UpsertMemorySliceInput = z.object({
  id: z.string().optional(),
  scope: MemoryScope,
  projectId: z.string().nullable().optional(),
  title: z.string().min(1),
  content: z.string(),
  source: MemorySource.optional(),
})

export type UpsertMemorySliceInput = z.infer<typeof UpsertMemorySliceInput>

export const DeleteMemorySliceInput = z.object({
  id: z.string(),
})

export type DeleteMemorySliceInput = z.infer<typeof DeleteMemorySliceInput>
