import { cn } from '@utils/tailwind-class-merge'
import { AnimatePresence, motion } from 'motion/react'
import React from 'react'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'

interface Props {
  toolName: string
  input: unknown
  output?: unknown
  awaitingApproval?: boolean
  onApprove?: (remember: boolean) => void
  onDeny?: (remember: boolean) => void
}

export function ToolCallBlock({
  toolName,
  input,
  output,
  awaitingApproval,
  onApprove,
  onDeny,
}: Props) {
  const [expanded, setExpanded] = React.useState(false)
  const [remember, setRemember] = React.useState(false)

  const pending = output === undefined && !awaitingApproval
  const label = awaitingApproval
    ? `Allow ${toolName}?`
    : pending
      ? `Calling ${toolName}…`
      : toolName

  return (
    <div className="my-2 rounded-card border border-border bg-elevated text-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-panel">
        <span className="text-xs font-mono text-muted">{label}</span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto flex items-center gap-1 text-subtle hover:text-foreground transition-colors"
        >
          <IconChevronRight
            width={11}
            className={cn('transition-transform duration-200', expanded && 'rotate-90')}
          />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 border-t border-border space-y-2">
              <div>
                <p className="text-2xs font-semibold text-subtle uppercase tracking-wider mb-1">
                  Input
                </p>
                <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap wrap-break-word">
                  {JSON.stringify(input, null, 2)}
                </pre>
              </div>
              {output !== undefined && (
                <div>
                  <p className="text-2xs font-semibold text-subtle uppercase tracking-wider mb-1">
                    Output
                  </p>
                  <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap wrap-break-word">
                    {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {awaitingApproval && (
        <div className="px-3 py-2.5 border-t border-border flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-subtle cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-brand"
            />
            Remember this choice
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => onDeny?.(remember)}
              className="px-3 py-1 rounded-md text-xs text-subtle hover:text-foreground border border-border hover:border-border-strong transition-colors"
            >
              Deny
            </button>
            <button
              onClick={() => onApprove?.(remember)}
              className="px-3 py-1 rounded-md text-xs bg-brand text-white hover:bg-brand-hover transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
