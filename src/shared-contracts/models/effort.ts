import { z } from 'zod'
import type { ModelDTO } from '../schemas/model.schema'

// The reasoning-effort tiers the app understands, ordered low→high. Zod so a
// boundary (RPC input, model sync) can validate against it later; the type is
// derived, never hand-written.
export const Effort = z.enum(['low', 'medium', 'high', 'xhigh', 'max'])
export type Effort = z.infer<typeof Effort>

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

  if (model.provider === 'anthropic') {
    const extended = EXTENDED_EFFORT_MODEL_IDS.some((id) => model.id.includes(id))
    return extended ? EXTENDED_EFFORTS : STANDARD_EFFORTS
  }

  if (model.provider === 'openrouter') {
    return STANDARD_EFFORTS
  }

  return []
}
