import { formatSeconds } from '@utils/format-duration'
import { cn } from '@utils/tailwind-class-merge'
import { AnimatePresence, motion } from 'motion/react'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { useChatStore } from '@/features/chat/store/chat.store'

type ThinkingBlockProps = {
  messageId: string
  reasoning: string
  active?: boolean
  durationMs?: number | null
  tokenEstimate?: number
}

function thinkingLabel(active: boolean | undefined, durationMs: number | null | undefined) {
  if (active) {
    return 'Thinking…'
  }
  if (durationMs != null) {
    return `Thought for ${formatSeconds(durationMs)}`
  }
  return 'Thought'
}

export function ThinkingBlock({
  messageId,
  reasoning,
  active,
  durationMs,
  tokenEstimate,
}: ThinkingBlockProps) {
  const expanded = useChatStore((s) => s.thinkingExpanded[messageId] ?? false)
  const setThinkingExpanded = useChatStore((s) => s.setThinkingExpanded)

  const label = thinkingLabel(active, durationMs)

  return (
    <div className="mb-3">
      <button
        onClick={() => setThinkingExpanded(messageId, !expanded)}
        className="flex items-center gap-1.5 text-sm text-subtle hover:text-muted transition-colors cursor-pointer"
      >
        <span className={active ? 'shimmer-text' : ''}>{label}</span>
        {active && tokenEstimate != null && (
          <span className="text-xs text-subtle">· ~{tokenEstimate.toLocaleString()} tokens</span>
        )}
        <IconChevronRight
          width={12}
          className={cn('transition-transform duration-200 text-subtle', expanded && 'rotate-90')}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="thinking-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 pl-3 border-l border-border">
              <p className="text-xs text-subtle leading-relaxed whitespace-pre-wrap font-mono">
                {reasoning}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
