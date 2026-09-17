import { ToolDecision, ToolPolicy } from '@shared/tools/tool-policy'

// The three outcomes of the pure gate decision. 'run' and 'block' are final;
// 'ask' means the caller must prompt the user and re-decide on their answer.
export const GATE_ACTION = {
  run: 'run',
  block: 'block',
  ask: 'ask',
} as const

// Reason text returned with a blocked call. It becomes part of the tool's result,
// so the model reads why it was denied. 'user' is used by the caller after an ask
// prompt.
export const GATE_BLOCK_REASON = {
  policy: 'Denied by policy.',
  chat: 'Denied for this chat.',
  user: 'Denied by user.',
} as const

// A blocked call still returns a normal tool result, so this object is exactly
// what the model reads back. It has to be a plain instruction, not a bare status
// label: name the tool, say the block was a deliberate decision (not a transient
// error), and tell the model to stop and ask rather than retry. Without it the
// model reads a terse "Denied by user." as a recoverable failure and calls the
// tool again inside the agentic loop (see MAX_STEPS in run.ts).
export function blockedToolResult(toolName: string, reason: string) {
  return {
    blocked: true,
    reason,
    message:
      `The ${toolName} tool did not run. ${reason} This is a deliberate decision, ` +
      'not a temporary error, so calling it again will be blocked the same way. ' +
      `Do not retry ${toolName}. Acknowledge that the action was not performed and ` +
      'ask the user how they would like to proceed.',
  }
}

export type GateAction =
  | { action: typeof GATE_ACTION.run }
  | { action: typeof GATE_ACTION.block; reason: string }
  | { action: typeof GATE_ACTION.ask }

// The two-layer tool gate as a pure function, with the IO (DB reads, approval
// prompt, chunk emission) left to the caller. Layer 1 is the global per-tool
// policy; Layer 2 is the per-chat grant, only consulted when the policy is 'ask'.
export function decideToolGate(input: {
  alwaysAllowed: boolean
  policy: ToolPolicy
  grant: ToolDecision | undefined
}): GateAction {
  if (input.alwaysAllowed) {
    return { action: GATE_ACTION.run }
  }

  if (input.policy === ToolPolicy.enum.deny) {
    return { action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.policy }
  }

  if (input.policy === ToolPolicy.enum.allow) {
    return { action: GATE_ACTION.run }
  }

  // policy is 'ask': the per-chat grant decides, or we fall through to prompt.
  if (input.grant === ToolDecision.enum.deny) {
    return { action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.chat }
  }

  if (input.grant === ToolDecision.enum.allow) {
    return { action: GATE_ACTION.run }
  }

  return { action: GATE_ACTION.ask }
}
