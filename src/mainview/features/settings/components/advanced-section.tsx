import { cn } from '@utils/tailwind-class-merge'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'
import { DiagnosticsSection } from './diagnostics-section'

const RETRY_OPTIONS = [0, 1, 2, 3, 5]

const TIMEOUT_OPTIONS = [
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '60s' },
  { value: 120_000, label: '2m' },
  { value: 300_000, label: '5m' },
]

export function AdvancedSection() {
  const { data: currentSettings } = useSettings()

  return (
    <div className="space-y-6">
      {/* Max retries */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Max retries</label>
        <p className="text-xs text-subtle mb-3">
          How many times the AI SDK retries a failed request before surfacing an error. Set to 0 to
          fail immediately.
        </p>
        <div className="flex gap-2">
          {RETRY_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => settings.update({ maxRetries: n })}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
                currentSettings?.maxRetries === n
                  ? 'border-selected-border bg-selected-surface text-selected-foreground'
                  : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Request timeout */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Request timeout</label>
        <p className="text-xs text-subtle mb-3">
          Abort a stream if no response arrives within this window.
        </p>
        <div className="flex gap-2">
          {TIMEOUT_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => settings.update({ requestTimeoutMs: t.value })}
              className={cn(
                'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
                currentSettings?.requestTimeoutMs === t.value
                  ? 'border-selected-border bg-selected-surface text-selected-foreground'
                  : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Diagnostics */}
      <DiagnosticsSection />
    </div>
  )
}
