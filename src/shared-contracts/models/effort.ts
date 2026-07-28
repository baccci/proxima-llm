import { z } from 'zod'

// The reasoning-effort tiers the app understands, ordered low→high. `none` (the
// catalog's "no reasoning" stop) is intentionally excluded: in this app, off is the
// Think switch, not an effort level.
export const Effort = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
export type Effort = z.infer<typeof Effort>

// Canonical low→high rank, taken from the enum's declaration order so order lives in
// one place. Feed compareEffort to [...efforts].sort(compareEffort).
const EFFORT_RANK: readonly Effort[] = Effort.options

export function compareEffort(a: Effort, b: Effort): number {
  return EFFORT_RANK.indexOf(a) - EFFORT_RANK.indexOf(b)
}
