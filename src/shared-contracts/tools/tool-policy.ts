import { z } from 'zod'

// The resolved outcome of a tool gate: run the call or block it.
export const ToolDecision = z.enum(['allow', 'deny'])
export type ToolDecision = z.infer<typeof ToolDecision>

// The user-configured gate for a tool. 'ask' prompts on each call; the other
// two resolve straight to the matching ToolDecision, so ToolPolicy is a
// ToolDecision plus that one escape hatch.
export const ToolPolicy = z.enum([...ToolDecision.options, 'ask'])
export type ToolPolicy = z.infer<typeof ToolPolicy>
