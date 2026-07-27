import { tool } from 'ai'
import { z } from 'zod'
import { toErrorMessage } from '../../../utils/to-error'
import * as projectFileService from '../project-file.repository'

export function readProjectFileTool(ctx: { projectId?: string }) {
  return tool({
    description:
      'Read the text content of a project file by name. Use when the user references a project file or you need its content to answer a question.',
    inputSchema: z.object({
      name: z.string().describe('File name exactly as listed in the system prompt'),
    }),
    execute: async ({ name }) => {
      if (!ctx.projectId) {
        return { error: 'No project is active. Project files require a project context.' }
      }
      try {
        const content = projectFileService.readProjectFileTextByName(ctx.projectId, name)
        return { name, content }
      } catch (err) {
        return { error: toErrorMessage(err) }
      }
    },
  })
}
