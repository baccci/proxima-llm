import { tool } from 'ai';
import { z } from 'zod';
import { MemoryScope } from '../../../../shared-contracts/schemas/memory-slice.schema';
import * as memoryService from '../memory.repository';

export function readMemoryTool(ctx: { projectId?: string }) {
  return tool({
    description:
      'Read a memory slice by title. Use when the user asks about something you saved before, or when a slice title in the system prompt is relevant to the current question.',
    inputSchema: z.object({
      scope: MemoryScope.describe(
        "'global' for user-wide notes, 'project' for project-specific notes",
      ),
      title: z.string().describe('Exact title of the memory slice to read'),
    }),
    execute: async ({ scope, title }) => {
      if (scope === MemoryScope.enum.project && !ctx.projectId) {
        return { error: 'No project is active. Use scope: global.' };
      }
      const projectId = scope === MemoryScope.enum.project ? (ctx.projectId ?? null) : null;
      const slice = memoryService.readByTitle(scope, projectId, title);
      if (!slice) {
        return { error: `Memory slice not found: "${title}"` };
      }
      return { title: slice.title, content: slice.content };
    },
  });
}
