import { ToolDecision } from '../../../shared-contracts/tools/tool-policy'

// Tool-approval promise registry. When the stream engine hits an 'ask' tool it
// parks on a promise keyed by stream+call; the RPC layer resolves it once the
// user decides, and stream teardown settles any that are still pending.

type ApprovalResult = { decision: ToolDecision; remember: boolean }
type ApprovalResolver = (result: ApprovalResult) => void

const pending = new Map<string, ApprovalResolver>()

const keyFor = (streamId: string, toolCallId: string): string => `${streamId}:${toolCallId}`

// Park until the user decides on this tool call (or the stream settles/cancels).
export function awaitApproval(streamId: string, toolCallId: string): Promise<ApprovalResult> {
  return new Promise((resolve) => {
    pending.set(keyFor(streamId, toolCallId), resolve)
  })
}

// Resolve a single pending approval with the user's decision.
export function resolveApproval(
  streamId: string,
  toolCallId: string,
  decision: ToolDecision,
  remember: boolean,
): void {
  const key = keyFor(streamId, toolCallId)
  const resolve = pending.get(key)
  if (resolve) {
    pending.delete(key)
    resolve({ decision, remember })
  }
}

// Deny and clear every pending approval for a stream (on done/error/cancel), so
// no promise is left dangling.
export function settlePendingApprovals(streamId: string): void {
  const prefix = `${streamId}:`
  for (const [key, resolve] of pending) {
    if (key.startsWith(prefix)) {
      pending.delete(key)
      resolve({ decision: ToolDecision.enum.deny, remember: false })
    }
  }
}
