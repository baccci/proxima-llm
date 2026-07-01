export type PaletteColors = { bg: string; fr: string }

export type Palette = {
  key: string
  name: string
  light: PaletteColors
  dark: PaletteColors
}

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

export type CustomPalette = { light: PaletteColors; dark: PaletteColors }

export function isCustomPalette(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith('{')
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
    const parsed = JSON.parse(value as string) as unknown
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

export function resolvePalette(
  value: string | null | undefined,
  isDark: boolean,
): PaletteColors | null {
  if (!value) return null
  if (isCustomPalette(value)) {
    const custom = parseCustomPalette(value)
    if (!custom) return null
    return isDark ? custom.dark : custom.light
  }
  const palette = PROJECT_PALETTES.find((p) => p.key === value)
  if (!palette) return null
  return isDark ? palette.dark : palette.light
}

// Icon color override is stored as an 8-digit hex (#RRGGBBAA) so a single column
// carries both hue and opacity. null means "inherit the palette's fr".

export function composeIconColor(baseHex: string, opacityPct: number): string {
  const clamped = Math.max(0, Math.min(100, opacityPct))
  const alpha = Math.round((clamped / 100) * 255)
  const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase()
  return `${baseHex.slice(0, 7).toUpperCase()}${alphaHex}`
}

export function parseIconColor(value: string | null | undefined): {
  base: string
  opacityPct: number
} {
  if (!value) return { base: '', opacityPct: 100 }
  const base = value.slice(0, 7).toUpperCase()
  const alphaHex = value.slice(7, 9)
  const opacityPct = alphaHex ? Math.round((parseInt(alphaHex, 16) / 255) * 100) : 100
  return { base, opacityPct }
}

// The color to paint the project icon: an explicit override wins, else the palette fr.
export function resolveIconColor(
  iconColor: string | null | undefined,
  palette: PaletteColors | null,
): string | undefined {
  if (iconColor) return iconColor
  return palette?.fr
}
