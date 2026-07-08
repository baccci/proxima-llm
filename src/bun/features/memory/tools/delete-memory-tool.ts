import { tool } from 'ai';
import { z } from 'zod';
import * as memoryService from '../memory.repository';
import { notifyMemoryChanged } from '../memory-summary.service';

export function deleteMemoryTool(ctx: { projectId?: string }) {
  return tool({
    description:
      'Delete a memory slice by title. Only use when a note is clearly outdated, the user contradicts it, or the user explicitly asks you to forget it.',
    inputSchema: z.object({
      scope: z
        .enum(['global', 'project'])
        .describe("'global' for user-wide notes, 'project' for project-specific notes"),
      title: z.string().describe('Exact title of the memory slice to delete'),
    }),
    execute: async ({ scope, title }) => {
      if (scope === 'project' && !ctx.projectId) {
        return { error: 'No project is active. Use scope: global.' };
      }
      const projectId = scope === 'project' ? (ctx.projectId ?? null) : null;
      memoryService.deleteByTitle(scope, projectId, title);
      notifyMemoryChanged(scope, projectId);
      return { deleted: true, title };
    },
  });
}
