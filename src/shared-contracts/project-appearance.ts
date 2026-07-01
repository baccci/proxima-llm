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
