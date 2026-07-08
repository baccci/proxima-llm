import type { Tool } from 'ai';
import type { ToolName } from '../../../shared-contracts/tools/tool-catalog';
import type { ToolPolicy } from '../../../shared-contracts/tools/tool-policy';
import { deleteMemoryTool } from '../../features/memory/tools/delete-memory-tool';
import { readMemoryTool } from '../../features/memory/tools/read-memory-tool';
import { writeMemoryTool } from '../../features/memory/tools/write-memory-tool';
import { readProjectFileTool } from '../../features/project-file/tools/read-project-file-tool';
import { sliceTool } from './slice-tool';

export type ToolFactory = (ctx: { projectId?: string }) => Tool;

export type ToolRegistryEntry = {
  tool: Tool | ToolFactory;
  defaultPolicy: ToolPolicy;
};

export const BUILTIN_TOOLS: Record<ToolName, ToolRegistryEntry> = {
  get_capability_detail: {
    tool: sliceTool,
    defaultPolicy: 'ask',
  },
  read_memory: {
    tool: readMemoryTool,
    defaultPolicy: 'allow',
  },
  write_memory: {
    tool: writeMemoryTool,
    defaultPolicy: 'allow',
  },
  delete_memory: {
    tool: deleteMemoryTool,
    defaultPolicy: 'ask',
  },
  read_project_file: {
    tool: readProjectFileTool,
    defaultPolicy: 'allow',
  },
};
