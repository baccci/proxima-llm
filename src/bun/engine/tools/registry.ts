import type { ToolName } from '@shared/tools/tool-catalog'
import type { Tool } from 'ai'
import { deleteMemoryTool } from '../../features/memory/tools/delete-memory-tool'
import { readMemoryTool } from '../../features/memory/tools/read-memory-tool'
import { writeMemoryTool } from '../../features/memory/tools/write-memory-tool'
import { readProjectFileTool } from '../../features/project-file/tools/read-project-file-tool'
import { sliceTool } from './slice-tool'

export type ToolFactory = (ctx: { projectId?: string }) => Tool

// Runtime wiring only: which factory backs each tool name. Static policy
// metadata (defaultPolicy) lives with the tool catalog in shared-contracts.
export const BUILTIN_TOOLS: Record<ToolName, Tool | ToolFactory> = {
  get_capability_detail: sliceTool,
  read_memory: readMemoryTool,
  write_memory: writeMemoryTool,
  delete_memory: deleteMemoryTool,
  read_project_file: readProjectFileTool,
}
