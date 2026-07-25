import type { ModelDTO } from '@shared/schemas/model.schema'
import {
  supportsPdf,
  supportsThinking,
  supportsVision,
  supportsWebSearch,
} from '@/entities/model/capabilities'

export type ComposerCapabilities = {
  canThink: boolean
  canVision: boolean
  canPdf: boolean
  canBrowse: boolean
}

// What the selected model can do drives which composer controls are enabled.
export function getCapabilities(model: ModelDTO | undefined): ComposerCapabilities {
  if (!model) {
    return { canThink: false, canVision: false, canPdf: false, canBrowse: false }
  }

  return {
    canThink: supportsThinking(model),
    canVision: supportsVision(model),
    canPdf: supportsPdf(model),
    canBrowse: supportsWebSearch(model),
  }
}

// File-picker accept lists, gated by what the model can read.
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
const PDF_ACCEPT = 'application/pdf'

// Build the file-input accept string for the attachment types the model supports.
export function attachmentAccept(caps: Pick<ComposerCapabilities, 'canVision' | 'canPdf'>): string {
  return [...(caps.canVision ? [IMAGE_ACCEPT] : []), ...(caps.canPdf ? [PDF_ACCEPT] : [])].join(',')
}
