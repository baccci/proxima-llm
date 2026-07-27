import { z } from 'zod'
import { ProviderId } from '../providers/registry'
import type { ModelDTO } from '../schemas/model.schema'

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

// The three tiers every reasoning model exposes; extended models add two on top.
const STANDARD_EFFORTS: Effort[] = ['low', 'medium', 'high']
const EXTENDED_EFFORTS: Effort[] = [...STANDARD_EFFORTS, 'xhigh', 'max']

// Anthropic model ids that expose the two extra tiers above standard.
const EXTENDED_EFFORT_MODEL_IDS = ['claude-opus-4-7', 'claude-opus-4-8']

// Normalized effort levels a model accepts, ordered low→high. Empty when the
// model can't reason. Single source of truth for the provider adapters and the
// renderer (which can't import bun code).
export function effortLevelsForModel(model: ModelDTO): string[] {
  if (!model.capabilities.thinking) {
    return []
  }

  if (model.provider === ProviderId.enum.anthropic) {
    const extended = EXTENDED_EFFORT_MODEL_IDS.some((id) => model.id.includes(id))
    return extended ? EXTENDED_EFFORTS : STANDARD_EFFORTS
  }

  if (model.provider === ProviderId.enum.openrouter) {
    return STANDARD_EFFORTS
  }

  return []
}
