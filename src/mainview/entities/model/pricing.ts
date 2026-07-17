import { isFreeModel } from '@shared/models/pricing'
import type { ModelDTO } from '@shared/schemas/model.schema'

// Renders a per-million price with `fix` decimal places, trimming trailing zeros.
function formatPrice(price: number, fix: number = 3): string {
  const formattedPrice = price.toFixed(fix).replace(/\.?0+$/, '')
  return `$${formattedPrice}/M`
}

export function formatPricing(model: ModelDTO): string {
  if (model.pricing === null) {
    return '—'
  }

  if (isFreeModel(model)) {
    return 'Free'
  }

  const perMillion = model.pricing.prompt * 1_000_000
  if (perMillion < 1) {
    // Under $1 per million tokens, show 3 decimals so small prices stay legible.
    return formatPrice(perMillion, 3)
  }

  // From $1 per million tokens up, 2 decimals is enough.
  return formatPrice(perMillion, 2)
}
