import { Slider } from '@base-ui-components/react'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/popover'
import {
  composeIconColor,
  DEFAULT_ICON_KEY,
  PROJECT_ICON_KEYS,
  parseIconColor,
  resolveIconColor,
} from '@/entities/project/icon'
import {
  type CustomPalette,
  isCustomPalette,
  PROJECT_PALETTES,
  parseCustomPalette,
  resolvePalette,
  serializeCustomPalette,
} from '@/entities/project/palette'
import { getProjectIcon } from '@/features/projects/lib/project-icon'
import { useIsDark } from '@/hooks/use-is-dark'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

// A lone '#' is the empty state of a hex input: a prompt char, not a valid color.
const EMPTY_HEX = '#'
// Full opacity, used when no explicit opacity has been chosen yet.
const DEFAULT_OPACITY_PCT = 100
// Neutral track color for the opacity slider when no base color is set yet.
const SLIDER_FALLBACK_COLOR = '#888'

const DEFAULT_CUSTOM: CustomPalette = {
  light: { bg: '#F1F5F9', fr: '#334155' },
  dark: { bg: '#1E293B', fr: '#CBD5E1' },
}

// The four hex fields of the custom-palette editor: bg + fr for each theme.
type CustomDraft = {
  lightBg: string
  lightFr: string
  darkBg: string
  darkFr: string
}

function customFromDraft(draft: CustomDraft): string {
  return serializeCustomPalette({
    light: { bg: draft.lightBg, fr: draft.lightFr },
    dark: { bg: draft.darkBg, fr: draft.darkFr },
  })
}

type ProjectAppearancePickerProps = {
  icon: string | null
  palette: string | null
  iconColor: string | null
  onIconChange: (icon: string | null) => void
  onPaletteChange: (palette: string | null) => void
  onIconColorChange: (iconColor: string | null) => void
}

// A square grid button used for icon / color / palette swatches: owns the shared
// shape (size, focus ring) and the selection ring, spreads the rest.
type SwatchButtonProps = React.ComponentProps<'button'> & { selected?: boolean }

function SwatchButton({ selected, className, ...props }: SwatchButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'h-8 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'ring-2 ring-ring',
        className,
      )}
      {...props}
    />
  )
}

// Full-width slider that reads as opacity: the track fades transparent -> the
// current icon color, with a knob and % label, so it can't be mistaken for a swatch.
type OpacitySliderProps = {
  base: string
  value: number
  onChange: (pct: number) => void
}

function OpacitySlider({ base, value, onChange }: OpacitySliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-2xs text-muted">Opacity</span>
        <span className="text-2xs text-muted tabular-nums">{value}%</span>
      </div>
      <Slider.Root
        min={0}
        max={100}
        step={5}
        value={value}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      >
        <Slider.Control className="flex items-center py-1.5 select-none touch-none">
          <Slider.Track className="relative h-2 w-full rounded-full border border-border bg-surface">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(to right, transparent, ${base || SLIDER_FALLBACK_COLOR})`,
              }}
            />
            <Slider.Thumb className="relative z-10 size-3.5 rounded-full border-2 border-surface bg-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  )
}

// A mini mock of the app in one theme: the box is that theme's neutral surface,
// and the pill inside is painted with the custom palette's bg/fr for that mode —
// so you see how the project pill would look on a light vs dark sidebar. `active`
// marks the box matching the running app theme.
const BOX_SURFACE = { light: '#F7F7F8', dark: '#1D1D20' }
const BOX_LABEL = { light: '#6C6C73', dark: '#8B8B92' }

type PaletteBoxProps = {
  label: string
  active: boolean
  boxDark: boolean
  bg: string
  fr: string
  onBg: (v: string) => void
  onFr: (v: string) => void
  Icon: React.FC<React.ComponentProps<'svg'>>
}

function PaletteBox({ label, active, boxDark, bg, fr, onBg, onFr, Icon }: PaletteBoxProps) {
  const bgValid = HEX_RE.test(bg)
  const frValid = HEX_RE.test(fr)
  const theme = boxDark ? 'dark' : 'light'
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          'flex flex-col gap-1 rounded-lg p-2 h-16 justify-between',
          active ? 'border-2 border-ring' : 'border border-border',
        )}
        style={{ backgroundColor: BOX_SURFACE[theme] }}
      >
        <span className="text-2xs font-medium" style={{ color: BOX_LABEL[theme] }}>
          {active ? `${label} · current` : label}
        </span>
        <div
          className="w-full flex items-center gap-1.5 px-2 h-6 rounded-md"
          style={{
            backgroundColor: bgValid ? bg : 'transparent',
            color: frValid ? fr : BOX_LABEL[theme],
          }}
        >
          <Icon width={13} />
          <span className="text-xs font-semibold">Aa</span>
        </div>
      </div>
      <input
        value={bg}
        onChange={(e) => onBg(e.target.value)}
        spellCheck={false}
        placeholder="#bg"
        className={cn(
          'h-6 px-1.5 rounded border bg-panel text-2xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          bgValid ? 'border-border' : 'border-danger',
        )}
      />
      <input
        value={fr}
        onChange={(e) => onFr(e.target.value)}
        spellCheck={false}
        placeholder="#fr"
        className={cn(
          'h-6 px-1.5 rounded border bg-panel text-2xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          frValid ? 'border-border' : 'border-danger',
        )}
      />
    </div>
  )
}

export function ProjectAppearancePicker({
  icon,
  palette,
  iconColor,
  onIconChange,
  onPaletteChange,
  onIconColorChange,
}: ProjectAppearancePickerProps) {
  const isDark = useIsDark()
  const { base: iconColorBase, opacityPct } = parseIconColor(iconColor)
  const [hexDraft, setHexDraft] = React.useState(iconColorBase || EMPTY_HEX)

  const isCustom = isCustomPalette(palette)
  const seededCustom = parseCustomPalette(palette) ?? DEFAULT_CUSTOM
  const [customDraft, setCustomDraft] = React.useState<CustomDraft>({
    lightBg: seededCustom.light.bg,
    lightFr: seededCustom.light.fr,
    darkBg: seededCustom.dark.bg,
    darkFr: seededCustom.dark.fr,
  })

  const previewColors = resolvePalette(palette, isDark)
  const previewIconColor = resolveIconColor(iconColor, previewColors)
  const PreviewIcon = getProjectIcon(icon)

  function commitCustom(next: CustomDraft) {
    setCustomDraft(next)
    const allValid = [next.lightBg, next.lightFr, next.darkBg, next.darkFr].every((h) =>
      HEX_RE.test(h),
    )
    if (allValid) {
      onPaletteChange(customFromDraft(next))
    }
  }

  function selectCustom() {
    if (isCustom) {
      return
    }
    // Seed the custom editor from the currently-selected preset palette (both
    // themes), or from the neutral default when no preset is active.
    const lightPreset = resolvePalette(palette, false)
    const darkPreset = resolvePalette(palette, true)
    const seed =
      lightPreset && darkPreset ? { light: lightPreset, dark: darkPreset } : DEFAULT_CUSTOM
    const next: CustomDraft = {
      lightBg: seed.light.bg.toUpperCase(),
      lightFr: seed.light.fr.toUpperCase(),
      darkBg: seed.dark.bg.toUpperCase(),
      darkFr: seed.dark.fr.toUpperCase(),
    }
    setCustomDraft(next)
    onPaletteChange(customFromDraft(next))
  }

  function pickIconColor(base: string) {
    setHexDraft(base)
    onIconColorChange(composeIconColor(base, opacityPct || DEFAULT_OPACITY_PCT))
  }

  function clearIconColor() {
    setHexDraft(EMPTY_HEX)
    onIconColorChange(null)
  }

  function onHexInput(value: string) {
    setHexDraft(value)
    if (HEX_RE.test(value)) {
      onIconColorChange(composeIconColor(value, opacityPct || DEFAULT_OPACITY_PCT))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Icon */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted">Icon</label>
        <div className="flex gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-2xs text-subtle uppercase tracking-wider">Icon</span>
            <PopoverRoot>
              <PopoverTrigger className="flex items-center justify-center size-9 rounded-lg border border-border bg-panel text-foreground hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <PreviewIcon width={16} />
              </PopoverTrigger>
              <PopoverContent className="w-56">
                <div className="grid grid-cols-6 gap-1.5">
                  {PROJECT_ICON_KEYS.map((key) => {
                    const Icon = getProjectIcon(key)
                    const selected = (icon ?? DEFAULT_ICON_KEY) === key
                    return (
                      <SwatchButton
                        key={key}
                        onClick={() => onIconChange(key === DEFAULT_ICON_KEY ? null : key)}
                        selected={selected}
                        className={cn(
                          'flex items-center justify-center text-muted hover:bg-surface-hover transition-colors',
                          selected && 'text-foreground',
                        )}
                      >
                        <Icon width={16} />
                      </SwatchButton>
                    )
                  })}
                </div>
              </PopoverContent>
            </PopoverRoot>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-2xs text-subtle uppercase tracking-wider">Icon color</span>
            <PopoverRoot>
              <PopoverTrigger
                title="Icon color"
                className="flex items-center justify-center size-9 rounded-lg border border-border bg-panel hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="size-5 rounded-md border border-border"
                  style={previewIconColor ? { backgroundColor: previewIconColor } : undefined}
                />
              </PopoverTrigger>
              <PopoverContent className="w-60">
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-6 gap-1.5">
                    <SwatchButton
                      onClick={clearIconColor}
                      selected={iconColor === null}
                      className="border border-border text-2xs text-muted hover:bg-surface-hover transition-colors"
                    >
                      Match
                    </SwatchButton>
                    {PROJECT_PALETTES.map((p) => {
                      const base = resolvePalette(p.key, isDark)!.fr.toUpperCase()
                      const selected = iconColorBase === base
                      return (
                        <SwatchButton
                          key={p.key}
                          title={p.name}
                          onClick={() => pickIconColor(base)}
                          selected={selected}
                          className="border border-border transition-transform hover:scale-105"
                        >
                          <span
                            className="block w-full h-full rounded-md"
                            style={{ backgroundColor: base }}
                          />
                        </SwatchButton>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-2xs text-muted shrink-0">Custom</span>
                    <input
                      value={hexDraft}
                      onChange={(e) => onHexInput(e.target.value)}
                      placeholder="#RRGGBB"
                      spellCheck={false}
                      className={cn(
                        'flex-1 min-w-0 h-7 px-2 rounded-md border bg-panel text-xs font-mono text-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        hexDraft !== EMPTY_HEX && !HEX_RE.test(hexDraft)
                          ? 'border-danger'
                          : 'border-border',
                      )}
                    />
                    <span
                      className="size-7 rounded-md border border-border shrink-0"
                      style={HEX_RE.test(hexDraft) ? { backgroundColor: hexDraft } : undefined}
                    />
                  </div>

                  {iconColor && (
                    <OpacitySlider
                      base={iconColorBase}
                      value={opacityPct}
                      onChange={(pct) => onIconColorChange(composeIconColor(iconColorBase, pct))}
                    />
                  )}
                </div>
              </PopoverContent>
            </PopoverRoot>
          </div>
        </div>
      </div>

      {/* Palette */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted">Palette</label>
        <div className="grid grid-cols-6 gap-1.5">
          <SwatchButton
            onClick={() => onPaletteChange(null)}
            selected={palette === null}
            className="border border-border text-2xs text-muted hover:bg-surface-hover transition-colors"
          >
            Native
          </SwatchButton>
          {PROJECT_PALETTES.map((p) => {
            const colors = resolvePalette(p.key, isDark)!
            const selected = palette === p.key
            return (
              <SwatchButton
                key={p.key}
                title={p.name}
                onClick={() => onPaletteChange(p.key)}
                selected={selected}
                style={{ backgroundColor: colors.bg, color: colors.fr }}
                className="text-2xs font-semibold transition-transform hover:scale-105"
              >
                Aa
              </SwatchButton>
            )
          })}
          <PopoverRoot>
            <PopoverTrigger
              title="Custom palette"
              onClick={selectCustom}
              className={cn(
                'h-8 rounded-lg border border-border text-2xs font-semibold text-muted transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isCustom && 'ring-2 ring-ring',
              )}
            >
              +
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="grid grid-cols-2 gap-2">
                <PaletteBox
                  label="Light"
                  active={!isDark}
                  boxDark={false}
                  bg={customDraft.lightBg}
                  fr={customDraft.lightFr}
                  onBg={(v) => commitCustom({ ...customDraft, lightBg: v })}
                  onFr={(v) => commitCustom({ ...customDraft, lightFr: v })}
                  Icon={PreviewIcon}
                />
                <PaletteBox
                  label="Dark"
                  active={isDark}
                  boxDark={true}
                  bg={customDraft.darkBg}
                  fr={customDraft.darkFr}
                  onBg={(v) => commitCustom({ ...customDraft, darkBg: v })}
                  onFr={(v) => commitCustom({ ...customDraft, darkFr: v })}
                  Icon={PreviewIcon}
                />
              </div>
            </PopoverContent>
          </PopoverRoot>
        </div>
      </div>
    </div>
  )
}
