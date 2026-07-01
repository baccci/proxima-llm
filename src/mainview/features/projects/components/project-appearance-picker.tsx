import { PROJECT_ICON_KEYS, PROJECT_PALETTES, resolvePalette } from '@shared/project-appearance'
import { cn } from '@utils/tailwind-class-merge'
import { getProjectIcon } from '@/features/projects/lib/project-icon'
import { useIsDark } from '@/features/projects/lib/use-is-dark'

interface ProjectAppearancePickerProps {
  icon: string | null
  palette: string | null
  onIconChange: (icon: string | null) => void
  onPaletteChange: (palette: string | null) => void
}

export function ProjectAppearancePicker({
  icon,
  palette,
  onIconChange,
  onPaletteChange,
}: ProjectAppearancePickerProps) {
  const isDark = useIsDark()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">Icon</label>
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
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">Color</label>
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
        </div>
      </div>
    </div>
  )
}
