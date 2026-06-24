import type { Tool } from 'ai';
import type { ToolName } from '../../../shared-contracts/tools/tool-catalog';
import { sliceTool } from './slice-tool';

export type DefaultPolicy = 'allow' | 'ask' | 'deny';

export interface ToolRegistryEntry {
  tool: Tool;
  defaultPolicy: DefaultPolicy;
}

export const BUILTIN_TOOLS: Record<ToolName, ToolRegistryEntry> = {
  get_capability_detail: {
    tool: sliceTool,
    defaultPolicy: 'ask',
  },
};
