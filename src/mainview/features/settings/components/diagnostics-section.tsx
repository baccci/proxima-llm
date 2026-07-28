import { useMutation } from '@tanstack/react-query'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { Button } from '@/components/button'
import { DialogContent, DialogRoot } from '@/components/dialog'
import { useLogInfo } from '@/features/settings/hooks/use-log-info'
import { logs } from '@/features/settings/settings.api'

function formatBytes(bytes: number): string {
  // Bytes size
  if (bytes < 1024) {
    return `${bytes} B`
  }
  // Kilobytes size
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  // Megabytes size
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DiagnosticsSection() {
  const { data: logInfo } = useLogInfo()
  const clearMutation = useMutation({ mutationFn: () => logs.clear() })
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const sizeLabel =
    logInfo != null ? `Logs using ${formatBytes(logInfo.sizeBytes)}` : 'Calculating…'

  function executeClear() {
    setConfirmOpen(false)
    clearMutation.mutate()
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">Diagnostics</label>
      <p className="text-xs text-subtle mb-3">{sizeLabel}</p>
      <div className="flex gap-2">
        <DiagButton onClick={() => logs.openFolder()}>Open logs folder</DiagButton>
        <DiagButton onClick={() => logs.openFile()}>Open today's log</DiagButton>
        <DiagButton onClick={() => setConfirmOpen(true)} disabled={clearMutation.isPending}>
          {clearMutation.isPending ? 'Clearing…' : 'Clear logs'}
        </DiagButton>
      </div>

      <DialogRoot open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          overModal
          title="Clear logs?"
          description="All log files will be permanently deleted. This cannot be undone."
        >
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={executeClear}>
              Clear logs
            </Button>
          </div>
        </DialogContent>
      </DialogRoot>
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
