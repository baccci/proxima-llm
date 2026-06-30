import { cn } from '@utils/tailwind-class-merge'
import { IconChevronLeft } from '@/components/icons/icon-chevron-left'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { IconMaximize } from '@/components/icons/icon-maximize'
import { IconMinimize } from '@/components/icons/icon-minimize'
import { IconX } from '@/components/icons/icon-x'

interface Props {
  currentIndex: number
  total: number
  showPrompt: boolean
  isFullscreen: boolean
  onPrev: () => void
  onNext: () => void
  onTogglePrompt: () => void
  onToggleFullscreen: () => void
  onClose: () => void
}

export function FocusModeNav({
  currentIndex,
  total,
  showPrompt,
  isFullscreen,
  onPrev,
  onNext,
  onTogglePrompt,
  onToggleFullscreen,
  onClose,
}: Props) {
  const btnBase =
    'flex items-center justify-center rounded-lg transition-colors text-subtle hover:text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <div className="flex items-center gap-2 px-8 py-4 shrink-0">
      <button
        onClick={onPrev}
        disabled={currentIndex === 0}
        className={cn(btnBase, 'h-8 w-8')}
        title="Previous exchange (←)"
      >
        <IconChevronLeft width={16} />
      </button>

      <span className="text-sm text-subtle tabular-nums select-none w-16 text-center">
        {total === 0 ? '—' : `${currentIndex + 1} / ${total}`}
      </span>

      <button
        onClick={onNext}
        disabled={currentIndex >= total - 1}
        className={cn(btnBase, 'h-8 w-8')}
        title="Next exchange (→)"
      >
        <IconChevronRight width={16} />
      </button>

      <div className="flex-1" />

      <button
        onClick={onTogglePrompt}
        className={cn(
          btnBase,
          'px-3 h-8 text-xs font-medium gap-1.5',
          showPrompt && 'text-foreground bg-surface',
        )}
        title="Toggle prompt visibility (P)"
      >
        {showPrompt ? 'Hide prompt' : 'Show prompt'}
        <kbd className="text-2xs opacity-50">P</kbd>
      </button>

      <button
        onClick={onToggleFullscreen}
        className={cn(btnBase, 'h-8 w-8')}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? <IconMinimize width={15} /> : <IconMaximize width={15} />}
      </button>

      <button
        onClick={onClose}
        className={cn(btnBase, 'h-8 w-8 ml-1')}
        title="Exit focus mode (Esc)"
      >
        <IconX width={15} />
      </button>
    </div>
  )
}
