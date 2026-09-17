import { clamp } from '@utils/clamp'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { jumpInto } from '@/features/chat/lib/jump-into-stream'
import { type StreamingMessage, useChatStore } from '@/features/chat/store/chat.store'
import type { Exchange } from '../entities/group-into-exchanges'
import { computeFontWeight, computeLineHeight } from '../helpers/typography'
import { useFitTypography } from '../hooks/use-fit-typography'
import { useFocusModeExchanges } from '../hooks/use-focus-mode-exchanges'
import { useFocusModeFullscreen } from '../hooks/use-focus-mode-fullscreen'
import { useFocusModeKeyboard } from '../hooks/use-focus-mode-keyboard'
import { useFocusModeStore } from '../store/focus-mode.store'
import { FocusModeContent } from './focus-mode-content'
import { FocusModeNav } from './focus-mode-nav'

// The "new prompt is streaming" toast; F jumps into it, the button dismisses it.
function IncomingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-60 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 shadow-pop text-sm">
        <span className="text-foreground">↪ New prompt streaming — Jump in</span>
        <kbd className="rounded border border-border px-1 py-0.5 text-xs font-mono text-muted">
          F
        </kbd>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 text-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

// Placeholder shown until the chat has an exchange to display.
function FocusModeEmpty() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-subtle italic">Waiting for a prompt…</p>
    </div>
  )
}

type ReadingSurfaceProps = {
  contentRef: React.RefObject<HTMLDivElement>
  fontSize: number
  twoColumn: boolean
  exchange: Exchange | null
  showPrompt: boolean
  streaming: StreamingMessage | null
}

// The fluid-typography reading block. The contentRef and the inline style write to
// the same element that useFitTypography measures, so its imperative sizing and the
// committed React style stay on one node.
function ReadingSurface({
  contentRef,
  fontSize,
  twoColumn,
  exchange,
  showPrompt,
  streaming,
}: ReadingSurfaceProps) {
  return (
    <div
      ref={contentRef}
      className={cn(
        'w-full mx-auto px-8',
        twoColumn ? 'columns-2 gap-10 py-12' : 'my-auto py-16 max-w-5xl',
      )}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: computeLineHeight(fontSize),
        fontWeight: computeFontWeight(fontSize),
      }}
    >
      <FocusModeContent exchange={exchange} showPrompt={showPrompt} streaming={streaming} />
    </div>
  )
}

/**
 * Fullscreen reading surface that walks a chat one exchange at a time.
 * Mounted only while focus mode is open (see main-pane), so its lifetime maps
 * directly onto OS fullscreen.
 */
export function FocusModeOverlay() {
  const exchangeIndex = useFocusModeStore((s) => s.exchangeIndex)
  const showPrompt = useFocusModeStore((s) => s.showPrompt)
  const setExchangeIndex = useFocusModeStore((s) => s.setExchangeIndex)
  const setShowPrompt = useFocusModeStore((s) => s.setShowPrompt)
  const pendingIncoming = useFocusModeStore((s) => s.pendingIncoming)
  const setPendingIncoming = useFocusModeStore((s) => s.setPendingIncoming)
  const close = useFocusModeStore((s) => s.close)
  const streaming = useChatStore((s) => s.streaming)

  const overlayRef = React.useRef<HTMLDivElement>(null)
  const exchanges = useFocusModeExchanges()

  // Clamp the stored index so it stays valid as exchanges stream in or change.
  const lastIndex = Math.max(0, exchanges.length - 1)
  const safeIndex = clamp(exchangeIndex, 0, lastIndex)
  const currentExchange = exchanges[safeIndex] ?? null

  // Fit font size to the viewport; switch to two columns only at the size floor.
  // resetKey is safeIndex. The ResizeObserver handles streaming growth and window resize.
  const { ref: contentRef, fontSize, twoColumn } = useFitTypography(safeIndex)

  const goTo = (index: number) => setExchangeIndex(clamp(index, 0, lastIndex))
  const goToPrev = () => goTo(safeIndex - 1)
  const goToNext = () => goTo(safeIndex + 1)
  const togglePrompt = () => setShowPrompt(!showPrompt)

  const handleJumpIncoming = pendingIncoming ? () => jumpInto(pendingIncoming) : undefined

  // Enter/exit OS fullscreen with this component's lifetime; bind the shortcuts.
  const { isFullscreen, toggleFullscreen } = useFocusModeFullscreen(overlayRef, close)
  useFocusModeKeyboard({
    onPrev: goToPrev,
    onNext: goToNext,
    onTogglePrompt: togglePrompt,
    onJumpIncoming: handleJumpIncoming,
  })

  return (
    // Fullscreen layer. The [&_pre] rules keep code blocks at a readable fixed size and
    // unsplit across columns. Inline code is intentionally not pinned here, so its own
    // text-[0.85em] rides the fluid prose fontSize instead of being clamped to a fixed size.
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-background flex flex-col [&_pre]:text-sm [&_pre]:break-inside-avoid"
    >
      {pendingIncoming && <IncomingBanner onDismiss={() => setPendingIncoming(null)} />}

      <FocusModeNav
        currentIndex={safeIndex}
        total={exchanges.length}
        showPrompt={showPrompt}
        isFullscreen={isFullscreen}
        onPrev={goToPrev}
        onNext={goToNext}
        onTogglePrompt={togglePrompt}
        onToggleFullscreen={toggleFullscreen}
        onClose={close}
      />

      {/* Scroll container. The inner block carries the fluid typography style so the
          imperative fontSize writes in useFitTypography target the same element as
          the committed React inline style. */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {exchanges.length === 0 && <FocusModeEmpty />}
        {exchanges.length > 0 && (
          <ReadingSurface
            contentRef={contentRef}
            fontSize={fontSize}
            twoColumn={twoColumn}
            exchange={currentExchange}
            showPrompt={showPrompt}
            streaming={streaming}
          />
        )}
      </div>
    </div>
  )
}
