import type { UpdateSettingsInput } from '@shared/schemas/settings.schema'
import { cn } from '@utils/tailwind-class-merge'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'

type Theme = 'light' | 'dark' | 'system'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function AppearanceSection() {
  const { data: currentSettings } = useSettings()

  function patch(input: UpdateSettingsInput) {
    settings.update(input)
  }

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-3">Theme</label>
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => patch({ theme: t.value })}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
                currentSettings?.theme === t.value
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Send on enter */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Send on Enter</p>
          <p className="text-xs text-subtle mt-0.5">When off, use ⌘+Enter to send</p>
        </div>
        <button
          role="switch"
          aria-checked={currentSettings?.sendOnEnter ?? true}
          onClick={() => patch({ sendOnEnter: !(currentSettings?.sendOnEnter ?? true) })}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-ring',
            (currentSettings?.sendOnEnter ?? true) ? 'bg-brand' : 'bg-surface-hover',
          )}
        >
          <span
            className={cn(
              'block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform absolute top-0.75 left-0.75',
              (currentSettings?.sendOnEnter ?? true) ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  )
}
