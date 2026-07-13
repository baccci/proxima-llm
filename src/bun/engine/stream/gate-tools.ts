import type { ToolCallOptions } from '@ai-sdk/provider-utils';
import type { Tool } from 'ai';
import type { StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import { isAlwaysAllowed } from '../../../shared-contracts/tools/tool-catalog';
import { ToolDecision, ToolPolicy } from '../../../shared-contracts/tools/tool-policy';
import { getPolicy } from '../../features/tool-permission/tool-permission.repository';
import { BUILTIN_TOOLS } from '../tools/registry';

export type ApprovalResult = { decision: ToolDecision; remember: boolean };

type OnChunk = (chunk: StreamChunk) => void;
type AwaitApproval = (
  toolCallId: string,
  toolName: string,
  input: unknown,
) => Promise<ApprovalResult>;
type GetToolGrant = (toolName: string) => ToolDecision | undefined;
type SetToolGrant = (toolName: string, decision: ToolDecision) => void;

// Wrap each registered tool's execute with the two-layer policy gate.
// Layer 1: global per-tool policy (deny/allow/ask). Layer 2: per-chat grant (only when global is 'ask').
export function buildGatedTools(
  projectId: string | undefined,
  onChunk: OnChunk,
  awaitApproval: AwaitApproval,
  getToolGrant: GetToolGrant,
  setToolGrant: SetToolGrant,
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  for (const [name, factory] of Object.entries(BUILTIN_TOOLS)) {
    const resolvedTool = typeof factory === 'function' ? factory({ projectId }) : factory;
    const originalExecute = resolvedTool.execute;
    tools[name] = {
      ...resolvedTool,
      execute: async (input: unknown, callOpts: ToolCallOptions) => {
        if (isAlwaysAllowed(name)) {
          return originalExecute!(input as never, callOpts);
        }
        const policy = getPolicy(name); // Layer 1, global

        if (policy === ToolPolicy.enum.deny) {
          return { blocked: true, reason: 'Denied by policy.' };
        }

        if (policy === ToolPolicy.enum.allow) {
          return originalExecute!(input as never, callOpts);
        }

        // policy === 'ask' falls to Layer 2, the per-chat grant
        const grant = getToolGrant(name);
        if (grant === ToolDecision.enum.deny) {
          return { blocked: true, reason: 'Denied for this chat.' };
        }
        if (grant !== ToolDecision.enum.allow) {
          onChunk({
            kind: 'tool-approval-request',
            toolCallId: callOpts.toolCallId,
            toolName: name,
            input,
          });
          const { decision, remember } = await awaitApproval(callOpts.toolCallId, name, input);
          if (remember) {
            setToolGrant(name, decision);
          }
          if (decision === ToolDecision.enum.deny) {
            return { blocked: true, reason: 'Denied by user.' };
          }
        }

        return originalExecute!(input as never, callOpts);
      },
    };
  }

  return tools;
}
