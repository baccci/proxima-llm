import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { IconChevronLeft } from '@/components/icons/icon-chevron-left'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { IconMaximize } from '@/components/icons/icon-maximize'
import { IconMinimize } from '@/components/icons/icon-minimize'
import { IconX } from '@/components/icons/icon-x'

const BTN_BASE =
  'flex items-center justify-center rounded-lg transition-colors text-subtle hover:text-foreground hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type NavIconButtonProps = {
  onClick: () => void
  title: string
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

// Square icon button shared by the nav's prev/next/fullscreen/close controls.
function NavIconButton({ onClick, title, disabled, className, children }: NavIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(BTN_BASE, 'h-8 w-8', className)}
    >
      {children}
    </button>
  )
}

type FocusModeNavProps = {
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
}: FocusModeNavProps) {
  return (
    <div className="flex items-center gap-2 px-8 py-4 shrink-0">
      <NavIconButton onClick={onPrev} disabled={currentIndex === 0} title="Previous exchange (←)">
        <IconChevronLeft width={16} />
      </NavIconButton>

      <span className="text-sm text-subtle tabular-nums select-none w-16 text-center">
        {total === 0 ? '—' : `${currentIndex + 1} / ${total}`}
      </span>

      <NavIconButton
        onClick={onNext}
        disabled={currentIndex >= total - 1}
        title="Next exchange (→)"
      >
        <IconChevronRight width={16} />
      </NavIconButton>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onTogglePrompt}
        className={cn(
          BTN_BASE,
          'px-3 h-8 text-xs font-medium gap-1.5',
          showPrompt && 'text-foreground bg-surface',
        )}
        title="Toggle prompt visibility (P)"
      >
        {showPrompt ? 'Hide prompt' : 'Show prompt'}
        <kbd className="text-2xs opacity-50">P</kbd>
      </button>

      <NavIconButton
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? <IconMinimize width={15} /> : <IconMaximize width={15} />}
      </NavIconButton>

      <NavIconButton onClick={onClose} title="Exit focus mode (Esc)" className="ml-1">
        <IconX width={15} />
      </NavIconButton>
    </div>
  )
}
