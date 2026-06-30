import type { ModelDTO } from '../schemas/model.schema'

const EFFORT_XHIGH_MAX = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_STANDARD = ['low', 'medium', 'high']

// Normalized effort levels a model accepts, ordered low→high. Empty when the
// model can't reason. Single source of truth for both the provider adapters and
// the renderer (which can't import bun code).
export function effortLevelsForModel(model: ModelDTO): string[] {
  if (!model.capabilities.thinking) return []
  if (model.provider === 'anthropic') {
    if (model.id.includes('claude-opus-4-7') || model.id.includes('claude-opus-4-8')) {
      return EFFORT_XHIGH_MAX
    }
    return EFFORT_STANDARD
  }
  if (model.provider === 'openrouter') return EFFORT_STANDARD
  return []
}
