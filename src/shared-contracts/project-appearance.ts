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
    light: { bg: '#F2EAD3', fr: '#E45049' },
    dark: { bg: '#F2EAD3', fr: '#E45049' },
  },
  {
    key: 'paper',
    name: 'Paper',
    light: { bg: '#FBFBFB', fr: '#E65554' },
    dark: { bg: '#FBFBFB', fr: '#E65554' },
  },
  {
    key: 'synthwave',
    name: 'Synthwave',
    light: { bg: '#16002A', fr: '#CF3FB9' },
    dark: { bg: '#16002A', fr: '#CF3FB9' },
  },
  {
    key: 'hacker',
    name: 'Hacker',
    light: { bg: '#040F0A', fr: '#4CFB71' },
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
    light: { bg: '#2A0A00', fr: '#FF8A3D' },
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

export function resolvePalette(
  key: string | null | undefined,
  isDark: boolean,
): PaletteColors | null {
  if (!key) return null
  const palette = PROJECT_PALETTES.find((p) => p.key === key)
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
