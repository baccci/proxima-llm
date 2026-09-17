import { describe, expect, test } from 'bun:test'
import { ToolDecision } from '@shared/tools/tool-policy'
import { awaitApproval, resolveApproval, settlePendingApprovals } from './approval-registry'

// The registry keeps one module-level Map shared across the whole file, so each
// test uses its own streamId/toolCallId to stay isolated from the others.
describe('approval-registry', () => {
  test('resolveApproval settles the awaited promise with the decision', async () => {
    const promise = awaitApproval('stream-resolve', 'call-1')
    resolveApproval('stream-resolve', 'call-1', ToolDecision.enum.allow, true)
    expect(await promise).toEqual({ decision: ToolDecision.enum.allow, remember: true })
  })

  test('settlePendingApprovals denies every pending call for the stream', async () => {
    const first = awaitApproval('stream-settle', 'call-1')
    const second = awaitApproval('stream-settle', 'call-2')
    settlePendingApprovals('stream-settle')
    expect(await first).toEqual({ decision: ToolDecision.enum.deny, remember: false })
    expect(await second).toEqual({ decision: ToolDecision.enum.deny, remember: false })
  })

  test('resolving a call that already settled is a no-op', async () => {
    const promise = awaitApproval('stream-noop', 'call-1')
    resolveApproval('stream-noop', 'call-1', ToolDecision.enum.allow, false)
    await promise
    // The entry is gone, so a second resolve finds nothing and must not throw.
    expect(() =>
      resolveApproval('stream-noop', 'call-1', ToolDecision.enum.deny, true),
    ).not.toThrow()
  })

  test('streams are isolated: settling one leaves the other pending', async () => {
    const a = awaitApproval('stream-a', 'call-1')
    const b = awaitApproval('stream-b', 'call-1')
    settlePendingApprovals('stream-a')
    expect(await a).toEqual({ decision: ToolDecision.enum.deny, remember: false })
    // stream-b was untouched, so the user can still resolve it normally.
    resolveApproval('stream-b', 'call-1', ToolDecision.enum.allow, true)
    expect(await b).toEqual({ decision: ToolDecision.enum.allow, remember: true })
  })
})
