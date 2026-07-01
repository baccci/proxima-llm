import { Slider } from '@base-ui-components/react'
import {
  type CustomPalette,
  composeIconColor,
  isCustomPalette,
  PROJECT_ICON_KEYS,
  PROJECT_PALETTES,
  parseCustomPalette,
  parseIconColor,
  resolveIconColor,
  resolvePalette,
  serializeCustomPalette,
} from '@shared/project-appearance'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { PopoverContent, PopoverRoot, PopoverTrigger } from '@/components/popover'
import { getProjectIcon } from '@/features/projects/lib/project-icon'
import { useIsDark } from '@/features/projects/lib/use-is-dark'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

const DEFAULT_CUSTOM: CustomPalette = {
  light: { bg: '#F1F5F9', fr: '#334155' },
  dark: { bg: '#1E293B', fr: '#CBD5E1' },
}

interface ProjectAppearancePickerProps {
  icon: string | null
  palette: string | null
  iconColor: string | null
  onIconChange: (icon: string | null) => void
  onPaletteChange: (palette: string | null) => void
  onIconColorChange: (iconColor: string | null) => void
}

// Full-width slider that reads as opacity: the track fades transparent -> the
// current icon color, with a knob and % label, so it can't be mistaken for a swatch.
function OpacitySlider({
  base,
  value,
  onChange,
}: {
  base: string
  value: number
  onChange: (pct: number) => void
}) {
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
              style={{ background: `linear-gradient(to right, transparent, ${base || '#888'})` }}
            />
            <Slider.Thumb className="relative z-10 size-3.5 rounded-full border-2 border-surface bg-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </div>
  )
}

// One mode's editor: the whole preview area is filled with that mode's bg and
// shows the icon + Aa in that mode's fr, so it always previews its own mode
// regardless of the active app theme. `active` (the current app theme) only
// adds a border to mark which mode you're seeing.
function PaletteBox({
  label,
  active,
  bg,
  fr,
  onBg,
  onFr,
  Icon,
}: {
  label: string
  active: boolean
  bg: string
  fr: string
  onBg: (v: string) => void
  onFr: (v: string) => void
  Icon: React.FC<React.ComponentProps<'svg'>>
}) {
  const bgValid = HEX_RE.test(bg)
  const frValid = HEX_RE.test(fr)
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg p-1.5',
        active ? 'border border-border' : 'border border-transparent',
      )}
    >
      <span className="text-2xs text-subtle">{active ? `${label} · current` : label}</span>
      <div
        className="flex items-center justify-center gap-1.5 h-9 rounded-md border border-border"
        style={{
          backgroundColor: bgValid ? bg : 'var(--color-surface)',
          color: frValid ? fr : undefined,
        }}
      >
        <Icon width={14} />
        <span className="text-xs font-semibold">Aa</span>
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
  const [hexDraft, setHexDraft] = React.useState(iconColorBase || '#')

  const isCustom = isCustomPalette(palette)
  const seededCustom = parseCustomPalette(palette) ?? DEFAULT_CUSTOM
  const [customDraft, setCustomDraft] = React.useState({
    lightBg: seededCustom.light.bg,
    lightFr: seededCustom.light.fr,
    darkBg: seededCustom.dark.bg,
    darkFr: seededCustom.dark.fr,
  })

  const previewColors = resolvePalette(palette, isDark)
  const previewIconColor = resolveIconColor(iconColor, previewColors)
  const PreviewIcon = getProjectIcon(icon)

  function commitCustom(next: typeof customDraft) {
    setCustomDraft(next)
    const allValid = [next.lightBg, next.lightFr, next.darkBg, next.darkFr].every((h) =>
      HEX_RE.test(h),
    )
    if (allValid) {
      onPaletteChange(
        serializeCustomPalette({
          light: { bg: next.lightBg, fr: next.lightFr },
          dark: { bg: next.darkBg, fr: next.darkFr },
        }),
      )
    }
  }

  function selectCustom() {
    if (isCustom) return
    const built = resolvePalette(palette, false)
    const seed =
      built && !isCustom
        ? { light: resolvePalette(palette, false)!, dark: resolvePalette(palette, true)! }
        : DEFAULT_CUSTOM
    const next = {
      lightBg: seed.light.bg.toUpperCase(),
      lightFr: seed.light.fr.toUpperCase(),
      darkBg: seed.dark.bg.toUpperCase(),
      darkFr: seed.dark.fr.toUpperCase(),
    }
    setCustomDraft(next)
    onPaletteChange(
      serializeCustomPalette({
        light: { bg: next.lightBg, fr: next.lightFr },
        dark: { bg: next.darkBg, fr: next.darkFr },
      }),
    )
  }

  function pickIconColor(base: string) {
    setHexDraft(base)
    onIconColorChange(composeIconColor(base, opacityPct || 100))
  }

  function clearIconColor() {
    setHexDraft('#')
    onIconColorChange(null)
  }

  function onHexInput(value: string) {
    setHexDraft(value)
    if (HEX_RE.test(value)) onIconColorChange(composeIconColor(value, opacityPct || 100))
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
                    const selected = (icon ?? 'folder') === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onIconChange(key === 'folder' ? null : key)}
                        className={cn(
                          'flex items-center justify-center h-8 rounded-lg text-muted hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected && 'ring-2 ring-ring text-foreground',
                        )}
                      >
                        <Icon width={16} />
                      </button>
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
                    <button
                      type="button"
                      onClick={clearIconColor}
                      className={cn(
                        'h-8 rounded-lg border border-border text-2xs text-muted hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        iconColor === null && 'ring-2 ring-ring',
                      )}
                    >
                      Match
                    </button>
                    {PROJECT_PALETTES.map((p) => {
                      const base = resolvePalette(p.key, isDark)!.fr.toUpperCase()
                      const selected = iconColorBase === base
                      return (
                        <button
                          key={p.key}
                          type="button"
                          title={p.name}
                          onClick={() => pickIconColor(base)}
                          className={cn(
                            'h-8 rounded-lg border border-border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected && 'ring-2 ring-ring',
                          )}
                        >
                          <span
                            className="block w-full h-full rounded-md"
                            style={{ backgroundColor: base }}
                          />
                        </button>
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
                        hexDraft !== '#' && !HEX_RE.test(hexDraft)
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
          <button
            type="button"
            onClick={() => onPaletteChange(null)}
            className={cn(
              'h-8 rounded-lg border border-border text-2xs text-muted hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              palette === null && 'ring-2 ring-ring',
            )}
          >
            Native
          </button>
          {PROJECT_PALETTES.map((p) => {
            const colors = resolvePalette(p.key, isDark)!
            const selected = palette === p.key
            return (
              <button
                key={p.key}
                type="button"
                title={p.name}
                onClick={() => onPaletteChange(p.key)}
                style={{ backgroundColor: colors.bg, color: colors.fr }}
                className={cn(
                  'h-8 rounded-lg text-2xs font-semibold transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected && 'ring-2 ring-ring',
                )}
              >
                Aa
              </button>
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
                  bg={customDraft.lightBg}
                  fr={customDraft.lightFr}
                  onBg={(v) => commitCustom({ ...customDraft, lightBg: v })}
                  onFr={(v) => commitCustom({ ...customDraft, lightFr: v })}
                  Icon={PreviewIcon}
                />
                <PaletteBox
                  label="Dark"
                  active={isDark}
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
