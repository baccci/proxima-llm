import { describe, expect, test } from 'bun:test';
import { ToolDecision, ToolPolicy } from '../../../shared-contracts/tools/tool-policy';
import { decideToolGate, GATE_ACTION, GATE_BLOCK_REASON } from './gate-decision';

type Input = Parameters<typeof decideToolGate>[0];

// Default to the interesting case (global 'ask', no grant); each test overrides.
function input(over: Partial<Input> = {}): Input {
  return { alwaysAllowed: false, policy: ToolPolicy.enum.ask, grant: undefined, ...over };
}

describe('decideToolGate', () => {
  test('alwaysAllowed runs regardless of policy or grant', () => {
    const decision = decideToolGate(
      input({
        alwaysAllowed: true,
        policy: ToolPolicy.enum.deny,
        grant: ToolDecision.enum.deny,
      }),
    );
    expect(decision).toEqual({ action: GATE_ACTION.run });
  });

  test('global deny blocks with the policy reason', () => {
    const decision = decideToolGate(input({ policy: ToolPolicy.enum.deny }));
    expect(decision).toEqual({ action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.policy });
  });

  test('global allow runs and ignores the per-chat grant', () => {
    const decision = decideToolGate(
      input({ policy: ToolPolicy.enum.allow, grant: ToolDecision.enum.deny }),
    );
    expect(decision).toEqual({ action: GATE_ACTION.run });
  });

  test('ask plus per-chat deny blocks with the chat reason', () => {
    const decision = decideToolGate(
      input({ policy: ToolPolicy.enum.ask, grant: ToolDecision.enum.deny }),
    );
    expect(decision).toEqual({ action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.chat });
  });

  test('ask plus per-chat allow runs', () => {
    const decision = decideToolGate(
      input({ policy: ToolPolicy.enum.ask, grant: ToolDecision.enum.allow }),
    );
    expect(decision).toEqual({ action: GATE_ACTION.run });
  });

  test('ask with no grant prompts', () => {
    const decision = decideToolGate(input({ policy: ToolPolicy.enum.ask, grant: undefined }));
    expect(decision).toEqual({ action: GATE_ACTION.ask });
  });
});
