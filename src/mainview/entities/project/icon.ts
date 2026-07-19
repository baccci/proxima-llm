import { clamp } from '@utils/clamp'
import type { PaletteColors } from './palette'

export const PROJECT_ICON_KEYS = [
  'folder',
  'suitcase',
  'banknote',
  'code',
  'plane',
  'palette',
  'flask',
  'graduation-cap',
  'rocket',
  'book',
  'sparkles',
  'bot',
] as const

// Icon color override is stored as an 8-digit hex (#RRGGBBAA) so a single column
// carries both hue and opacity. null means "inherit the palette's fr".

const MIN_OPACITY_PCT = 0
const MAX_OPACITY_PCT = 100
const MAX_ALPHA = 255 // full opacity as an 8-bit channel
const RGB_HEX_END = 7 // '#RRGGBB'.length, the color part before the alpha byte
const ALPHA_HEX_END = 9 // '#RRGGBBAA'.length

export function composeIconColor(baseHex: string, opacityPct: number): string {
  const clamped = clamp(opacityPct, MIN_OPACITY_PCT, MAX_OPACITY_PCT)
  const alpha = Math.round((clamped / MAX_OPACITY_PCT) * MAX_ALPHA)
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase()
  return `${baseHex.slice(0, RGB_HEX_END).toUpperCase()}${alphaHex}`
}

export function parseIconColor(value: string | null | undefined): {
  base: string
  opacityPct: number
} {
  if (!value) {
    return { base: '', opacityPct: MAX_OPACITY_PCT }
  }

  const base = value.slice(0, RGB_HEX_END).toUpperCase()
  const alphaHex = value.slice(RGB_HEX_END, ALPHA_HEX_END)

  // A bare 6-digit hex has no alpha byte, so it reads as fully opaque.
  let opacityPct = MAX_OPACITY_PCT
  if (alphaHex) {
    opacityPct = Math.round((parseInt(alphaHex, 16) / MAX_ALPHA) * MAX_OPACITY_PCT)
  }

  return { base, opacityPct }
}

// The color to paint the project icon: an explicit override wins, else the palette fr.
export function resolveIconColor(
  iconColor: string | null | undefined,
  palette: PaletteColors | null,
): string | undefined {
  if (iconColor) {
    return iconColor
  }

  return palette?.fr
}
