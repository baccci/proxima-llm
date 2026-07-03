export type PaletteColors = { bg: string; fr: string }

export type Palette = {
  key: string
  name: string
  light: PaletteColors
  dark: PaletteColors
}

export type CustomPalette = { light: PaletteColors; dark: PaletteColors }

// Custom palettes are stored as serialized JSON, built-ins as a bare key.
// A leading '{' is the cheap discriminator between the two.
const CUSTOM_PALETTE_PREFIX = '{'

// Fixed palettes set light === dark; adaptive palettes differ per mode.
export const PROJECT_PALETTES: readonly Palette[] = [
  {
    key: 'clay',
    name: 'Clay',
    light: { bg: '#F2EAD3', fr: '#C0392B' },
    dark: { bg: '#2E2519', fr: '#E9897F' },
  },
  {
    key: 'paper',
    name: 'Paper',
    light: { bg: '#FBFBFB', fr: '#E65554' },
    dark: { bg: '#26262A', fr: '#FF6B6A' },
  },
  {
    key: 'synthwave',
    name: 'Synthwave',
    light: { bg: '#F3E0FF', fr: '#B01E9E' },
    dark: { bg: '#16002A', fr: '#CF3FB9' },
  },
  {
    key: 'hacker',
    name: 'Hacker',
    light: { bg: '#E3FBE9', fr: '#12813A' },
    dark: { bg: '#040F0A', fr: '#4CFB71' },
  },
  {
    key: 'terminal',
    name: 'Terminal',
    light: { bg: '#0A0A0A', fr: '#FAFAFA' },
    dark: { bg: '#0A0A0A', fr: '#FAFAFA' },
  },
  {
    key: 'sunset',
    name: 'Sunset',
    light: { bg: '#FFE9D6', fr: '#C2410C' },
    dark: { bg: '#2A0A00', fr: '#FF8A3D' },
  },
  {
    key: 'ocean',
    name: 'Ocean',
    light: { bg: '#E0F2FE', fr: '#0369A1' },
    dark: { bg: '#082F49', fr: '#38BDF8' },
  },
  {
    key: 'forest',
    name: 'Forest',
    light: { bg: '#DCFCE7', fr: '#15803D' },
    dark: { bg: '#052E16', fr: '#4ADE80' },
  },
  {
    key: 'royal',
    name: 'Royal',
    light: { bg: '#EDE9FE', fr: '#6D28D9' },
    dark: { bg: '#1E1B4B', fr: '#A78BFA' },
  },
  {
    key: 'slate',
    name: 'Slate',
    light: { bg: '#F1F5F9', fr: '#334155' },
    dark: { bg: '#1E293B', fr: '#CBD5E1' },
  },
]

// Narrows to `string` so callers can parse the JSON without a cast.
export function isCustomPalette(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(CUSTOM_PALETTE_PREFIX)
}

function isColors(v: unknown): v is PaletteColors {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as PaletteColors).bg === 'string' &&
    typeof (v as PaletteColors).fr === 'string'
  )
}

export function parseCustomPalette(value: string | null | undefined): CustomPalette | null {
  if (!isCustomPalette(value)) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const { light, dark } = parsed as { light?: unknown; dark?: unknown }
    if (!isColors(light) || !isColors(dark)) return null
    return { light: { bg: light.bg, fr: light.fr }, dark: { bg: dark.bg, fr: dark.fr } }
  } catch {
    return null
  }
}

export function serializeCustomPalette(cp: CustomPalette): string {
  return JSON.stringify({
    light: { bg: cp.light.bg, fr: cp.light.fr },
    dark: { bg: cp.dark.bg, fr: cp.dark.fr },
  })
}

// Pick the colors for the active color scheme.
function pickMode(
  pair: { light: PaletteColors; dark: PaletteColors },
  isDark: boolean,
): PaletteColors {
  return isDark ? pair.dark : pair.light
}

export function resolvePalette(
  value: string | null | undefined,
  isDark: boolean,
): PaletteColors | null {
  if (!value) return null
  if (isCustomPalette(value)) {
    const custom = parseCustomPalette(value)
    if (!custom) return null
    return pickMode(custom, isDark)
  }
  const palette = PROJECT_PALETTES.find((p) => p.key === value)
  if (!palette) return null
  return pickMode(palette, isDark)
}
