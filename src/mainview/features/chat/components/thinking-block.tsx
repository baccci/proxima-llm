import { cn } from '@utils/tailwind-class-merge'
import { AnimatePresence, motion } from 'motion/react'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { useChatStore } from '@/features/chat/store/chat.store'

type ThinkingBlockProps = {
  messageId: string
  reasoning: string
  active?: boolean
  durationLabel?: string
  tokenEstimate?: number
}

function thinkingLabel(active: boolean | undefined, durationLabel: string | undefined) {
  if (active) return 'Thinking…'
  if (durationLabel) return `Thought for ${durationLabel}`
  return 'Thought'
}

export function ThinkingBlock({
  messageId,
  reasoning,
  active,
  durationLabel,
  tokenEstimate,
}: ThinkingBlockProps) {
  const { thinkingExpanded, setThinkingExpanded } = useChatStore()
  const expanded = thinkingExpanded[messageId] ?? false

  const label = thinkingLabel(active, durationLabel)

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
