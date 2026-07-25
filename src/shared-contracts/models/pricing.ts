import { ProviderId } from '../providers/registry'
import type { ModelDTO } from '../schemas/model.schema'

// Free = calling it costs nothing. Pricing is the ground truth: prompt + completion
// both 0. When pricing is unknown, fall back to OpenRouter's `:free` id convention.
// Those variants get deactivated without notice, so Auto-title must never pick one.
export function isFreeModel(model: ModelDTO): boolean {
  if (model.pricing != null) {
    return model.pricing.prompt === 0 && model.pricing.completion === 0
  }

  return model.provider === ProviderId.enum.openrouter && model.id.endsWith(':free')
}
