import type { ModelDTO } from '@shared/schemas/model.schema'

export function isFreeModel(model: ModelDTO): boolean {
  return model.pricing !== null && model.pricing.prompt === 0 && model.pricing.completion === 0
}

export function formatPricing(model: ModelDTO): string {
  if (model.pricing === null) return '—'
  if (isFreeModel(model)) return 'Free'
  const perMillion = model.pricing.prompt * 1_000_000
  if (perMillion < 1) return `$${perMillion.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}/M`
  return `$${perMillion.toFixed(2).replace(/\.?0+$/, '')}/M`
}
