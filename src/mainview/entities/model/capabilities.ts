import { ANTHROPIC_FAMILIES } from '@shared/models/families'
import type { ModelDTO } from '@shared/schemas/model.schema'

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
  if (mediaType === 'application/pdf') return supportsPdf(model)
  if (mediaType.startsWith('image/')) return supportsVision(model)
  return false
}

export function defaultThinkingBudget(model: ModelDTO): number {
  return model.capabilities.defaultThinkingBudget ?? 8_000
}

// Widened to string[] so sortByFamily can indexOf any family (OpenRouter -> -1).
export const FAMILY_ORDER: readonly string[] = ANTHROPIC_FAMILIES

export function sortByFamily(models: ModelDTO[]): ModelDTO[] {
  return [...models].sort((a, b) => {
    const ai = FAMILY_ORDER.indexOf(a.family)
    const bi = FAMILY_ORDER.indexOf(b.family)
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
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
