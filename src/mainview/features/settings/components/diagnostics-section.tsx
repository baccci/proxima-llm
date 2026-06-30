import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { useLogInfo } from '@/features/settings/hooks/use-log-info'
import { logs } from '@/features/settings/settings.api'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const btnClass = cn(
  'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
  'border-border text-muted hover:bg-surface-hover hover:text-foreground',
)

export function DiagnosticsSection() {
  const { data: logInfo } = useLogInfo()
  const [clearing, setClearing] = React.useState(false)

  const sizeLabel =
    logInfo != null ? `Logs using ${formatBytes(logInfo.sizeBytes)}` : 'Calculating…'

  async function handleClear() {
    if (!window.confirm('Delete all log files? This cannot be undone.')) return
    setClearing(true)
    try {
      await logs.clear()
    } finally {
      setClearing(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">Diagnostics</label>
      <p className="text-xs text-subtle mb-3">{sizeLabel}</p>
      <div className="flex gap-2">
        <button className={btnClass} onClick={() => logs.openFolder()}>
          Open logs folder
        </button>
        <button className={btnClass} onClick={() => logs.openFile()}>
          Open today's log
        </button>
        <button className={btnClass} onClick={handleClear} disabled={clearing}>
          {clearing ? 'Clearing…' : 'Clear logs'}
        </button>
      </div>
    </div>
  )
}
