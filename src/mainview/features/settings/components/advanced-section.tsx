import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'

const RETRY_OPTIONS = [0, 1, 2, 3, 5]

const TIMEOUT_OPTIONS = [
  { value: 30_000, label: '30s' },
  { value: 60_000, label: '60s' },
  { value: 120_000, label: '2m' },
  { value: 300_000, label: '5m' },
]

export function AdvancedSection() {
  const { data: currentSettings } = useSettings()
  const [syncing, setSyncing] = React.useState(false)

  async function handleResync() {
    setSyncing(true)
    try {
      await settings.syncModels()
    } finally {
      setSyncing(false)
    }
  }

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
                  ? 'border-brand bg-brand/10 text-brand'
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
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-border text-muted hover:bg-surface-hover hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Model catalog */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Model catalog</label>
        <p className="text-xs text-subtle mb-3">
          Force a fresh sync of OpenRouter models, bypassing the 24-hour throttle.
        </p>
        <button
          onClick={handleResync}
          disabled={syncing}
          className="px-3 py-2 rounded-lg border border-border text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {syncing ? 'Syncing…' : 'Resync models'}
        </button>
      </div>
    </div>
  )
}
