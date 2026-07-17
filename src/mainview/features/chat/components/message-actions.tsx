import { type MessagePart, PartKind } from '@shared/schemas/message.schema'
import React from 'react'
import { Button } from '@/components/button'
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

function MessageActionButton({
  tooltip,
  icon,
  onClick,
  disabled,
}: {
  tooltip: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <TooltipWrapper content={tooltip} side="bottom">
      <Button variant="ghost" size="icon-xs" onClick={onClick} disabled={disabled}>
        {icon}
      </Button>
    </TooltipWrapper>
  )
}

export function MessageActions({ canEdit, parts, disabled, onRetry, onEdit, onCopy }: Props) {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasText = parts.some((p) => p.type === PartKind.enum.text)

  function handleCopy() {
    onCopy().then(() => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    })
  }

  return (
    <div className="flex gap-0.5">
      {canEdit && onRetry && (
        <MessageActionButton
          tooltip="Retry"
          icon={<IconRotateCcw width={13} />}
          onClick={onRetry}
          disabled={disabled}
        />
      )}
      {canEdit && onEdit && (
        <MessageActionButton
          tooltip="Edit"
          icon={<IconPencil width={13} />}
          onClick={onEdit}
          disabled={disabled}
        />
      )}
      {hasText && (
        <MessageActionButton
          tooltip={copied ? 'Copied!' : 'Copy'}
          icon={copied ? <IconCheck width={13} /> : <IconCopy width={13} />}
          onClick={handleCopy}
          disabled={disabled}
        />
      )}
    </div>
  )
}
