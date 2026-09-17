import { MemoryScope, MemorySource } from '@shared/schemas/memory-slice.schema'
import { tool } from 'ai'
import { z } from 'zod'
import * as memoryService from '../memory.repository'
import { notifyMemoryChanged } from '../memory-notify'

export function writeMemoryTool(ctx: { projectId?: string }) {
  return tool({
    description:
      'Save or update a memory slice. Only use when something is durable and will plausibly matter in a future, unrelated chat: a stable personal fact the user volunteers, a lasting project decision, or an explicit request to remember. Reuse the exact title of an existing note to update it rather than creating a near-duplicate.',
    inputSchema: z.object({
      scope: MemoryScope.describe(
        "'global' for user-wide notes, 'project' for project-specific notes",
      ),
      title: z.string().describe('Short descriptive title for the memory slice'),
      content: z.string().describe('Content to save'),
    }),
    execute: async ({ scope, title, content }) => {
      if (scope === MemoryScope.enum.project && !ctx.projectId) {
        return { error: 'No project is active. Use scope: global.' }
      }
      const projectId = scope === MemoryScope.enum.project ? (ctx.projectId ?? null) : null
      const slice = memoryService.writeByTitle(
        scope,
        projectId,
        title,
        content,
        MemorySource.enum.model,
      )
      notifyMemoryChanged(scope, projectId)
      return { saved: true, title: slice.title }
    },
  })
}
