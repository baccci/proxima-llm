import type { Effort } from '@shared/models/effort'
import type { ModelDTO } from '@shared/schemas/model.schema'
import { supportsThinking, supportsWebSearch } from '@/entities/model/capabilities'

export type ComposerFlags = {
  thinking: boolean
  webSearch: boolean
  effort: string | null
}

export type ComposerPatch = {
  thinking?: boolean
  webSearch?: boolean
  effort?: string | null
}

// The effort a model starts at when reasoning turns on: its declared default, else the
// middle of its ordered levels. A model with no effort granularity (efforts: []) has no
// starting effort, so this is null and no slider is shown.
export function pickInitialEffort(model: ModelDTO): Effort | null {
  const { defaultEffort, efforts } = model.capabilities
  if (defaultEffort) {
    return defaultEffort
  }
  if (efforts.length === 0) {
    return null
  }
  return efforts[Math.floor((efforts.length - 1) / 2)]
}

// When switching models, bring the composer flags into what the new model allows. Returns
// only the flags that change (empty when nothing does). Each caller applies the patch to
// its own sink: a chat.update for an existing chat, local state for a not-yet-created one.
export function reconcileComposer(model: ModelDTO, flags: ComposerFlags): ComposerPatch {
  const patch: ComposerPatch = {}

  // Thinking: a model that can't reason forces it off; a mandatory-reasoning model forces
  // it on. Otherwise the current choice stands.
  let thinking = flags.thinking
  if (!supportsThinking(model)) {
    thinking = false
  } else if (model.capabilities.reasoningMandatory) {
    thinking = true
  }
  if (thinking !== flags.thinking) {
    patch.thinking = thinking
  }

  if (flags.webSearch && !supportsWebSearch(model)) {
    patch.webSearch = false
  }

  // Effort follows the resulting thinking state and the model's level set: null when
  // thinking is off; the model's starting effort when thinking is on but the current level
  // is missing (covers switching to a narrower set, e.g. opus 'max' -> a model without it,
  // and turning reasoning on when we have no valid effort yet). pickInitialEffort is null
  // for a binary reasoning model, which is correct: no slider, nothing to send.
  let effort = flags.effort
  if (!thinking) {
    effort = null
  } else if (!effort || !model.capabilities.efforts.some((e) => e === effort)) {
    effort = pickInitialEffort(model)
  }
  if (effort !== flags.effort) {
    patch.effort = effort
  }

  return patch
}
