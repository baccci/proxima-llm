import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import React from 'react'
import { IconCheck } from '@/components/icons/icon-check'
import { IconCopy } from '@/components/icons/icon-copy'
import { IconPencil } from '@/components/icons/icon-pencil'
import { IconRotateCcw } from '@/components/icons/icon-rotate-ccw'
import { TooltipWrapper } from '@/components/tooltip'

const COPIED_RESET_MS = 1500

interface Props {
  canEdit: boolean
  parts: MessagePart[]
  disabled?: boolean
  onRetry?: () => void
  onEdit?: () => void
  onCopy: () => Promise<void>
}

const btnClass =
  'flex items-center justify-center h-5 w-5 rounded-lg text-subtle hover:text-foreground transition cursor-pointer'

export function MessageActions({ canEdit, parts, disabled, onRetry, onEdit, onCopy }: Props) {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasText = parts.some((p) => p.type === PartKind.enum.text)

  function handleCopy() {
    onCopy().then(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    })
  }

  return (
    <div className="flex gap-0.5">
      {canEdit && onRetry && (
        <TooltipWrapper content="Retry" side="bottom">
          <button onClick={onRetry} disabled={disabled} className={btnClass}>
            <IconRotateCcw width={13} />
          </button>
        </TooltipWrapper>
      )}
      {canEdit && onEdit && (
        <TooltipWrapper content="Edit" side="bottom">
          <button onClick={onEdit} disabled={disabled} className={btnClass}>
            <IconPencil width={13} />
          </button>
        </TooltipWrapper>
      )}
      {hasText && (
        <TooltipWrapper content={copied ? 'Copied!' : 'Copy'} side="bottom">
          <button onClick={handleCopy} disabled={disabled} className={btnClass}>
            {copied ? <IconCheck width={13} /> : <IconCopy width={13} />}
          </button>
        </TooltipWrapper>
      )}
    </div>
  )
}
