import { clamp } from '@utils/clamp'

// Fluid typography helpers for the focus-mode reading surface. Font size is
// determined by useFitTypography (viewport-fit); line-height and weight derive
// from the resolved size.

export const FONT_SIZE_MAX = 90
export const FONT_SIZE_MIN = 16

const LINE_HEIGHT_MIN = 1.2
const LINE_HEIGHT_MAX = 1.65

const FONT_WEIGHT_MIN = 400
const FONT_WEIGHT_MAX = 800

// Curves normalize against the full size range so they reach their limits
// exactly at FONT_SIZE_MIN / FONT_SIZE_MAX.
const FONT_SIZE_RANGE = FONT_SIZE_MAX - FONT_SIZE_MIN

export function computeLineHeight(fontSize: number): number {
  const t = clamp((fontSize - FONT_SIZE_MIN) / FONT_SIZE_RANGE, 0, 1)
  return LINE_HEIGHT_MAX - t * (LINE_HEIGHT_MAX - LINE_HEIGHT_MIN)
}

export function computeFontWeight(fontSize: number): number {
  const t = clamp((fontSize - FONT_SIZE_MIN) / FONT_SIZE_RANGE, 0, 1)
  return Math.round(FONT_WEIGHT_MIN + t * t * (FONT_WEIGHT_MAX - FONT_WEIGHT_MIN))
}
