import type { ModelDTO } from '@shared/schemas/model.schema'
import {
  supportsPdf,
  supportsThinking,
  supportsVision,
  supportsWebSearch,
} from '@/entities/model/capabilities'

export function getCapabilities(model: ModelDTO | undefined) {
  if (!model) {
    return {
      canThink: false,
      canVision: false,
      canPdf: false,
      canBrowse: false,
    }
  }

  // What the selected model can do drives which composer controls are enabled.
  const canThink = supportsThinking(model)
  const canVision = supportsVision(model)
  const canPdf = supportsPdf(model)
  const canBrowse = supportsWebSearch(model)

  return {
    canThink,
    canVision,
    canPdf,
    canBrowse,
  }
}
