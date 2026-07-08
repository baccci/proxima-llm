import type { Tool } from 'ai';
import type { ToolName } from '../../../shared-contracts/tools/tool-catalog';
import type { ToolPolicy } from '../../../shared-contracts/tools/tool-policy';
import { deleteMemoryTool } from './delete-memory-tool';
import { readMemoryTool } from './read-memory-tool';
import { readProjectFileTool } from './read-project-file-tool';
import { sliceTool } from './slice-tool';
import { writeMemoryTool } from './write-memory-tool';

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
