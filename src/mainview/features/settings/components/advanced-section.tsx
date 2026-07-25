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
      <OptionRow
        label="Max retries"
        description="How many times the AI SDK retries a failed request before surfacing an error. Set to 0 to fail immediately."
        options={RETRY_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
        current={currentSettings?.maxRetries}
        onSelect={(maxRetries) => settings.update({ maxRetries })}
      />

      <OptionRow
        label="Request timeout"
        description="Abort a stream if no response arrives within this window."
        options={TIMEOUT_OPTIONS}
        current={currentSettings?.requestTimeoutMs}
        onSelect={(requestTimeoutMs) => settings.update({ requestTimeoutMs })}
      />

      <DiagnosticsSection />
    </div>
  )
}

type OptionRowProps = {
  label: string
  description: string
  options: { value: number; label: string }[]
  current: number | undefined
  onSelect: (value: number) => void
}

// A setting rendered as a row of pill buttons, one per option, that patch a single field.
function OptionRow({ label, description, options, current, onSelect }: OptionRowProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <p className="text-xs text-subtle mb-3">{description}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={cn(
              'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
              current === opt.value
                ? 'border-selected-border bg-selected-surface text-selected-foreground'
                : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
