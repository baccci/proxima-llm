import type { ModelDTO } from '@shared/schemas/model.schema'
import { getCapabilities } from '@/features/chat/helpers/composer-capabilities'
import {
  type ComposerFlags,
  type ComposerPatch,
  deriveComposerReasoning,
  pickThinkingPatch,
  reconcileComposer,
} from '@/features/chat/helpers/composer-reasoning'

type UseComposerControlsConfig = {
  models: ModelDTO[]
  modelId: string | null
  flags: ComposerFlags
  // Persist a flag change (thinking / web search / effort). The sink is the caller's:
  // chat.update for an existing chat, local setState for a not-yet-created one.
  applyFlags: (patch: ComposerPatch) => void
  // Persist a model switch together with the flags it reconciles to, in one write, so the
  // two never land as separate updates. Same per-caller sink.
  changeModel: (id: string, patch: ComposerPatch) => void
}

export type ComposerControls = {
  model: ModelDTO | undefined
  canVision: boolean
  canPdf: boolean
  canBrowse: boolean
  thinkingActive: boolean
  effortActive: string | null
  onThinkingChange: (enabled: boolean) => void
  onWebSearchChange: (enabled: boolean) => void
  onEffortChange: (effort: string | null) => void
  onModelChange: (id: string) => void
}

// The composer's reasoning control surface for one render: what the selected model can do,
// the derived thinking/effort state, and the four flag handlers. The logic is shared by both
// composers (welcome and in-chat); only the write sink differs, which the caller injects.
export function useComposerControls(config: UseComposerControlsConfig): ComposerControls {
  const { models, modelId, flags, applyFlags, changeModel } = config

  const model = models.find((m) => m.id === modelId)
  const { canVision, canPdf, canBrowse } = getCapabilities(model)
  const { thinkingActive, effortActive } = deriveComposerReasoning(model, flags)

  function onThinkingChange(enabled: boolean) {
    applyFlags(pickThinkingPatch(enabled, model))
  }

  function onWebSearchChange(enabled: boolean) {
    applyFlags({ webSearch: enabled })
  }

  function onEffortChange(effort: string | null) {
    applyFlags({ effort })
  }

  function onModelChange(id: string) {
    // Unknown model id (a custom model not in the list): switch without reconciling flags.
    const next = models.find((m) => m.id === id)
    changeModel(id, next ? reconcileComposer(next, flags) : {})
  }

  return {
    model,
    canVision,
    canPdf,
    canBrowse,
    thinkingActive,
    effortActive,
    onThinkingChange,
    onWebSearchChange,
    onEffortChange,
    onModelChange,
  }
}
