import { useMutation } from '@tanstack/react-query'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { useLogInfo } from '@/features/settings/hooks/use-log-info'
import { logs } from '@/features/settings/settings.api'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DiagnosticsSection() {
  const { data: logInfo } = useLogInfo()
  const clearMutation = useMutation({ mutationFn: () => logs.clear() })

  const sizeLabel =
    logInfo != null ? `Logs using ${formatBytes(logInfo.sizeBytes)}` : 'Calculating…'

  function handleClear() {
    if (!window.confirm('Delete all log files? This cannot be undone.')) return
    clearMutation.mutate()
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">Diagnostics</label>
      <p className="text-xs text-subtle mb-3">{sizeLabel}</p>
      <div className="flex gap-2">
        <DiagButton onClick={() => logs.openFolder()}>Open logs folder</DiagButton>
        <DiagButton onClick={() => logs.openFile()}>Open today's log</DiagButton>
        <DiagButton onClick={handleClear} disabled={clearMutation.isPending}>
          {clearMutation.isPending ? 'Clearing…' : 'Clear logs'}
        </DiagButton>
      </div>
    </div>
  )
}

type DiagButtonProps = React.ComponentProps<'button'>

function DiagButton({ className, ...props }: DiagButtonProps) {
  return (
    <button
      className={cn(
        'flex-1 py-2 rounded-lg border text-sm transition-colors cursor-pointer',
        'border-border text-muted hover:bg-surface-hover hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
