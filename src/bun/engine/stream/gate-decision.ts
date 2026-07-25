import { ToolDecision, ToolPolicy } from '../../../shared-contracts/tools/tool-policy';

// The three outcomes of the pure gate decision. 'run' and 'block' are final;
// 'ask' means the caller must prompt the user and re-decide on their answer.
export const GATE_ACTION = {
  run: 'run',
  block: 'block',
  ask: 'ask',
} as const;

// Reason text returned with a blocked call. It becomes the tool's result, so the
// model reads why it was denied. 'user' is used by the caller after an ask prompt.
export const GATE_BLOCK_REASON = {
  policy: 'Denied by policy.',
  chat: 'Denied for this chat.',
  user: 'Denied by user.',
} as const;

export type GateAction =
  | { action: typeof GATE_ACTION.run }
  | { action: typeof GATE_ACTION.block; reason: string }
  | { action: typeof GATE_ACTION.ask };

// The two-layer tool gate as a pure function, with the IO (DB reads, approval
// prompt, chunk emission) left to the caller. Layer 1 is the global per-tool
// policy; Layer 2 is the per-chat grant, only consulted when the policy is 'ask'.
export function decideToolGate(input: {
  alwaysAllowed: boolean;
  policy: ToolPolicy;
  grant: ToolDecision | undefined;
}): GateAction {
  if (input.alwaysAllowed) {
    return { action: GATE_ACTION.run };
  }

  if (input.policy === ToolPolicy.enum.deny) {
    return { action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.policy };
  }

  if (input.policy === ToolPolicy.enum.allow) {
    return { action: GATE_ACTION.run };
  }

  // policy is 'ask': the per-chat grant decides, or we fall through to prompt.
  if (input.grant === ToolDecision.enum.deny) {
    return { action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.chat };
  }

  if (input.grant === ToolDecision.enum.allow) {
    return { action: GATE_ACTION.run };
  }

  return { action: GATE_ACTION.ask };
}
