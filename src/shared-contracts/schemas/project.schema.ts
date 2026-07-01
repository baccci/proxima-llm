import { z } from 'zod'

export const ProjectDTO = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  palette: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ProjectDTO = z.infer<typeof ProjectDTO>

export const CreateProjectInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
  palette: z.string().optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectInput>

export const UpdateProjectInput = CreateProjectInput.partial()
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>
