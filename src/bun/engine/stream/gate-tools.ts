import type { ToolCallOptions } from '@ai-sdk/provider-utils';
import type { Tool } from 'ai';
import type { StreamChunk } from '../../../shared-contracts/rpc/app-rpc.types';
import { STREAM_CHUNK_KIND } from '../../../shared-contracts/rpc/stream-chunk';
import { isAlwaysAllowed } from '../../../shared-contracts/tools/tool-catalog';
import { ToolDecision } from '../../../shared-contracts/tools/tool-policy';
import { getPolicy } from '../../features/tool-permission/tool-permission.repository';
import { BUILTIN_TOOLS } from '../tools/registry';
import { blockedToolResult, decideToolGate, GATE_ACTION, GATE_BLOCK_REASON } from './gate-decision';

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
        const decision = decideToolGate({
          alwaysAllowed: isAlwaysAllowed(name),
          policy: getPolicy(name),
          grant: getToolGrant(name),
        });

        if (decision.action === GATE_ACTION.block) {
          return blockedToolResult(name, decision.reason);
        }

        // policy 'ask' with no per-chat grant: prompt the user, then run or block on the answer.
        if (decision.action === GATE_ACTION.ask) {
          onChunk({
            kind: STREAM_CHUNK_KIND.toolApprovalRequest,
            toolCallId: callOpts.toolCallId,
            toolName: name,
            input,
          });
          const { decision: userDecision, remember } = await awaitApproval(
            callOpts.toolCallId,
            name,
            input,
          );
          if (remember) {
            setToolGrant(name, userDecision);
          }
          if (userDecision === ToolDecision.enum.deny) {
            return blockedToolResult(name, GATE_BLOCK_REASON.user);
          }
        }

        return originalExecute!(input as never, callOpts);
      },
    };
  }

  return tools;
}
