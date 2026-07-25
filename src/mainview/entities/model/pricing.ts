import { isFreeModel } from '@shared/models/pricing'
import type { ModelDTO } from '@shared/schemas/model.schema'

const TOKENS_PER_MILLION = 1_000_000

// Shown when a model carries no pricing data. Callers compare against this to style
// the "unknown price" case, so it lives here next to the code that produces it.
export const NO_PRICE = '—'

// Renders a per-million price with `fix` decimal places, trimming trailing zeros.
function formatPrice(price: number, fix: number): string {
  const formattedPrice = price.toFixed(fix).replace(/\.?0+$/, '')
  return `$${formattedPrice}/M`
}

export function formatPricing(model: ModelDTO): string {
  if (model.pricing === null) {
    return NO_PRICE
  }

  if (isFreeModel(model)) {
    return 'Free'
  }

  const perMillion = model.pricing.prompt * TOKENS_PER_MILLION
  if (perMillion < 1) {
    // Under $1 per million tokens, show 3 decimals so small prices stay legible.
    return formatPrice(perMillion, 3)
  }

  // From $1 per million tokens up, 2 decimals is enough.
  return formatPrice(perMillion, 2)
}
