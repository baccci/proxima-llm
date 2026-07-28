import type { Effort } from '@shared/models/effort'
import { capitalize } from '@utils/capitalize'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'

type EffortSliderProps = {
  levels: Effort[]
  value: Effort
  disabled?: boolean
  onChange: (effort: Effort) => void
}

// The level an arrow / Home / End key moves to, or null when the key does not change the
// selection (non-arrow key, already at the edge, disabled, or value off the scale). Pure
// so the slider's keyboard behavior is unit-testable without a DOM.
export function effortForKey(
  levels: Effort[],
  value: Effort,
  key: string,
  disabled = false,
): Effort | null {
  if (disabled) {
    return null
  }
  const i = levels.indexOf(value)
  if (i < 0) {
    return null
  }

  let next = i
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = Math.min(i + 1, levels.length - 1)
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = Math.max(i - 1, 0)
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = levels.length - 1
      break
    default:
      return null
  }

  return next === i ? null : levels[next]
}

// The level a click on stop `index` selects, or null when the click is a no-op (disabled,
// or an index outside the scale).
export function effortForClick(levels: Effort[], index: number, disabled = false): Effort | null {
  if (disabled || index < 0 || index >= levels.length) {
    return null
  }
  return levels[index]
}

// A discrete, stepped effort selector: one dot per level, accent fill up to and including
// the selected stop, hollow dots ahead. Operable by clicking a stop or by Left/Right
// (Up/Down, Home/End) while focused. One tab stop lives on the slider itself; the dots are
// pointer affordances (tabIndex -1) so the whole control is a single focus target.
export function EffortSlider({ levels, value, disabled, onChange }: EffortSliderProps) {
  const selectedIndex = levels.indexOf(value)

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const next = effortForKey(levels, value, e.key, disabled)
    if (next) {
      e.preventDefault()
      onChange(next)
    }
  }

  return (
    <div
      role="slider"
      aria-label="Reasoning effort"
      aria-valuemin={0}
      aria-valuemax={levels.length - 1}
      aria-valuenow={selectedIndex}
      aria-valuetext={capitalize(value)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      {levels.map((level, i) => {
        const filled = i <= selectedIndex
        const isThumb = i === selectedIndex
        // The thumb is always filled (it sits at the selected stop), so the dot color depends
        // only on `filled`; size is the only thing the thumb changes.
        const dotSize = isThumb ? 'h-3 w-3' : 'h-2 w-2'
        const dotColor = filled ? 'bg-brand' : 'bg-surface-hover'
        return (
          <React.Fragment key={level}>
            {i > 0 && (
              <span className={cn('h-0.5 flex-1', filled ? 'bg-brand' : 'bg-surface-hover')} />
            )}
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => {
                const next = effortForClick(levels, i, disabled)
                if (next) {
                  onChange(next)
                }
              }}
              className={cn(
                'shrink-0 rounded-full transition-colors cursor-pointer',
                dotSize,
                dotColor,
              )}
            />
          </React.Fragment>
        )
      })}
    </div>
  )
}
