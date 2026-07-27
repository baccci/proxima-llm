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

// When switching models, turn off any composer option the new model can't do.
// Returns only the flags that need changing (empty when nothing does). Each caller
// applies the patch to its own sink: a chat.update for an existing chat, local state
// for a not-yet-created one.
export function reconcileComposer(model: ModelDTO, flags: ComposerFlags): ComposerPatch {
  const patch: ComposerPatch = {}

  if (flags.thinking && !supportsThinking(model)) {
    patch.thinking = false
  }
  if (flags.webSearch && !supportsWebSearch(model)) {
    patch.webSearch = false
  }
  // Drop the effort if the new model doesn't offer it (covers losing thinking
  // entirely and switching to a narrower level set, e.g. opus 'max' → an OR model).
  if (flags.effort && !model.capabilities.efforts.some((e) => e === flags.effort)) {
    patch.effort = null
  }

  return patch
}
