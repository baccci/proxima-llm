import { describe, expect, test } from 'bun:test'
import { ToolDecision, ToolPolicy } from '@shared/tools/tool-policy'
import { blockedToolResult, decideToolGate, GATE_ACTION, GATE_BLOCK_REASON } from './gate-decision'

type Input = Parameters<typeof decideToolGate>[0]

// Default to the interesting case (global 'ask', no grant); each test overrides.
function input(over: Partial<Input> = {}): Input {
  return { alwaysAllowed: false, policy: ToolPolicy.enum.ask, grant: undefined, ...over }
}

describe('decideToolGate', () => {
  test('alwaysAllowed runs regardless of policy or grant', () => {
    const decision = decideToolGate(
      input({
        alwaysAllowed: true,
        policy: ToolPolicy.enum.deny,
        grant: ToolDecision.enum.deny,
      }),
    )
    expect(decision).toEqual({ action: GATE_ACTION.run })
  })

  test('global deny blocks with the policy reason', () => {
    const decision = decideToolGate(input({ policy: ToolPolicy.enum.deny }))
    expect(decision).toEqual({ action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.policy })
  })

  test('global allow runs and ignores the per-chat grant', () => {
    const decision = decideToolGate(
      input({ policy: ToolPolicy.enum.allow, grant: ToolDecision.enum.deny }),
    )
    expect(decision).toEqual({ action: GATE_ACTION.run })
  })

  test('ask plus per-chat deny blocks with the chat reason', () => {
    const decision = decideToolGate(
      input({ policy: ToolPolicy.enum.ask, grant: ToolDecision.enum.deny }),
    )
    expect(decision).toEqual({ action: GATE_ACTION.block, reason: GATE_BLOCK_REASON.chat })
  })

  test('ask plus per-chat allow runs', () => {
    const decision = decideToolGate(
      input({ policy: ToolPolicy.enum.ask, grant: ToolDecision.enum.allow }),
    )
    expect(decision).toEqual({ action: GATE_ACTION.run })
  })

  test('ask with no grant prompts', () => {
    const decision = decideToolGate(input({ policy: ToolPolicy.enum.ask, grant: undefined }))
    expect(decision).toEqual({ action: GATE_ACTION.ask })
  })
})

describe('blockedToolResult', () => {
  test('preserves the blocked flag and the reason label', () => {
    const result = blockedToolResult('delete_memory', GATE_BLOCK_REASON.user)
    expect(result.blocked).toBe(true)
    expect(result.reason).toBe(GATE_BLOCK_REASON.user)
  })

  test('message names the tool and tells the model to stop and ask, not retry', () => {
    const result = blockedToolResult('delete_memory', GATE_BLOCK_REASON.user)
    expect(result.message).toContain('delete_memory')
    expect(result.message).toContain(GATE_BLOCK_REASON.user)
    expect(result.message).toMatch(/do not retry/i)
    expect(result.message).toMatch(/proceed/i)
  })

  test('applies the same directive to the policy and chat reasons', () => {
    for (const reason of [GATE_BLOCK_REASON.policy, GATE_BLOCK_REASON.chat]) {
      const result = blockedToolResult('read_project_file', reason)
      expect(result.reason).toBe(reason)
      expect(result.message).toContain('read_project_file')
      expect(result.message).toContain(reason)
      expect(result.message).toMatch(/do not retry/i)
    }
  })
})
