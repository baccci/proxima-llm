import { ANTHROPIC_FAMILIES } from '@shared/models/families'
import type { ModelDTO } from '@shared/schemas/model.schema'

const PDF_MEDIA_TYPE = 'application/pdf'
const IMAGE_MEDIA_TYPE_PREFIX = 'image/'

// Tokens to allot for thinking when a model exposes no explicit default.
const DEFAULT_THINKING_BUDGET_TOKENS = 8_000

// Sort rank for a family missing from FAMILY_ORDER: large enough to fall after every
// known family (assumes fewer than this many known families).
const UNRANKED_FAMILY = 99

export function supportsThinking(model: ModelDTO): boolean {
  return model.capabilities.thinking
}

export function supportsVision(model: ModelDTO): boolean {
  return model.capabilities.vision
}

export function supportsPdf(model: ModelDTO): boolean {
  return model.capabilities.pdf
}

export function supportsWebSearch(model: ModelDTO): boolean {
  return model.capabilities.webSearch
}

export function supportsAttachment(model: ModelDTO, mediaType: string): boolean {
  if (mediaType === PDF_MEDIA_TYPE) {
    return supportsPdf(model)
  }

  if (mediaType.startsWith(IMAGE_MEDIA_TYPE_PREFIX)) {
    return supportsVision(model)
  }

  return false
}

export function defaultThinkingBudget(model: ModelDTO): number {
  return model.capabilities.defaultThinkingBudget ?? DEFAULT_THINKING_BUDGET_TOKENS
}

// Widened to string[] so sortByFamily can indexOf any family (OpenRouter -> -1).
export const FAMILY_ORDER: readonly string[] = ANTHROPIC_FAMILIES

export function sortByFamily(models: ModelDTO[]): ModelDTO[] {
  return [...models].sort((a, b) => {
    const ai = FAMILY_ORDER.indexOf(a.family)
    const bi = FAMILY_ORDER.indexOf(b.family)

    if (ai !== bi) {
      return (ai === -1 ? UNRANKED_FAMILY : ai) - (bi === -1 ? UNRANKED_FAMILY : bi)
    }

    return a.displayName.localeCompare(b.displayName)
  })
}

export function groupByFamily(models: ModelDTO[]): Map<string, ModelDTO[]> {
  const map = new Map<string, ModelDTO[]>()
  for (const m of sortByFamily(models)) {
    const list = map.get(m.family) ?? []
    list.push(m)
    map.set(m.family, list)
  }
  return map
}
