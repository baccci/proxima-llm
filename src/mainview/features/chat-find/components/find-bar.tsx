import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconChevronDown } from '@/components/icons/icon-chevron-down'
import { IconX } from '@/components/icons/icon-x'
import { FIND_MIN_QUERY_LENGTH } from '@/features/chat-find/constants'
import { useFocusFindInput } from '@/features/chat-find/hooks/use-focus-find-input'
import { useChatFindStore } from '@/features/chat-find/store/chat-find.store'

type FindBarProps = {
  total: number
  activeIndex: number
}

// The in-chat find bar: a floating strip over the messages, deliberately not a modal. Find
// has to leave the chat visible and scrollable behind it, which a focus-trapping modal
// cannot do. Mounted only while find is open, so the field re-focuses on every open.
export function FindBar({ total, activeIndex }: FindBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const query = useChatFindStore((s) => s.query)
  const setQuery = useChatFindStore((s) => s.setQuery)
  const step = useChatFindStore((s) => s.step)
  const close = useChatFindStore((s) => s.close)

  useFocusFindInput(inputRef)

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close()
      return
    }

    if (e.key === 'Enter') {
      // Enter would otherwise bubble to the composer and send the message.
      e.preventDefault()
      step(e.shiftKey ? -1 : 1, total)
    }
  }

  return (
    // top-14 clears the full-width drag handle app.tsx fixes over the first 56px; the
    // no-drag class keeps the strip clickable even so.
    //
    // Panel surface and border, the same pair the sidebar and the composer are built from,
    // rather than the `floating` tokens. Those are a dark translucent pill over light content
    // (the scroll-to-bottom button), which read as a different app on a light theme. The
    // shadow is the sidebar's, because this genuinely floats over the messages, and the
    // focus-within border is the composer's, because this is a field.
    <div className="absolute top-14 right-6 z-overlay flex items-center gap-1 py-1.5 pl-3 pr-1.5 rounded-card border border-border bg-panel shadow-modal transition-colors focus-within:border-border-strong electrobun-webkit-app-region-no-drag">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in chat"
        aria-label="Find in chat"
        className="w-44 bg-transparent text-sm text-foreground placeholder:text-subtle outline-none"
      />
      <MatchCounter query={query} total={total} activeIndex={activeIndex} />
      <StepButton label="Previous match" direction={-1} total={total} onStep={step} />
      <StepButton label="Next match" direction={1} total={total} onStep={step} />
      <button
        onClick={close}
        title="Close find"
        aria-label="Close find"
        className="flex items-center justify-center h-6 w-6 rounded-md text-subtle hover:text-foreground hover:bg-surface-hover transition-colors"
      >
        <IconX width={13} />
      </button>
    </div>
  )
}

type MatchCounterProps = {
  query: string
  total: number
  activeIndex: number
}

// Stays blank until the query is long enough to have actually been searched for, so a
// half-typed word never flashes "No results".
function MatchCounter({ query, total, activeIndex }: MatchCounterProps) {
  if (query.trim().length < FIND_MIN_QUERY_LENGTH) {
    return null
  }

  if (total === 0) {
    return <span className="text-xs text-subtle whitespace-nowrap">No results</span>
  }

  // Counted from one for the reader; activeIndex is a zero-based array index.
  const position = activeIndex + 1

  return (
    <span className="text-xs text-subtle tabular-nums whitespace-nowrap">
      {position}/{total}
    </span>
  )
}

type StepButtonProps = {
  label: string
  direction: -1 | 1
  total: number
  onStep: (delta: number, total: number) => void
}

function StepButton({ label, direction, total, onStep }: StepButtonProps) {
  return (
    <button
      onClick={() => onStep(direction, total)}
      disabled={total === 0}
      title={label}
      aria-label={label}
      className="flex items-center justify-center h-6 w-6 rounded-md text-subtle hover:text-foreground hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    >
      <IconChevronDown width={13} className={cn(direction === -1 && 'rotate-180')} />
    </button>
  )
}
