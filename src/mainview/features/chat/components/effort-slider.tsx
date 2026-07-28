import type { Effort } from '@shared/models/effort'
import { capitalize } from '@utils/capitalize'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'

type EffortSliderProps = Omit<React.ComponentProps<'div'>, 'onChange'> & {
  levels: Effort[]
  value: Effort
  disabled?: boolean
  onChange: (effort: Effort) => void
}

// A discrete, stepped effort selector shaped like the ChatGPT reasoning slider: a thick
// rounded track, an accent fill up to the selected stop, faint markers for the stops ahead,
// and a large draggable thumb. Operable by dragging or clicking the track (pointer capture
// keeps the drag tracking off-element) or by Left/Right (Up/Down, Home/End) while focused.
// One tab stop lives on the control itself.
export function EffortSlider({
  levels,
  value,
  disabled,
  onChange,
  className,
  ...rest
}: EffortSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const draggingRef = React.useRef(false)

  // Clamp the index so a value briefly off the scale still renders a valid thumb position.
  const selectedIndex = Math.max(0, levels.indexOf(value))
  const denom = Math.max(1, levels.length - 1)
  const percent = (selectedIndex / denom) * 100

  function commitFromClientX(clientX: number) {
    const track = trackRef.current
    if (!track) {
      return
    }
    const rect = track.getBoundingClientRect()
    const next = effortForPosition(levels, (clientX - rect.left) / rect.width, disabled)
    if (next && next !== value) {
      onChange(next)
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) {
      return
    }
    e.preventDefault()
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    commitFromClientX(e.clientX)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draggingRef.current) {
      commitFromClientX(e.clientX)
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

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
      aria-valuemax={denom}
      aria-valuenow={selectedIndex}
      aria-valuetext={capitalize(value)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={cn(
        'relative flex h-4 items-center rounded-md outline-none cursor-grab active:cursor-grabbing select-none touch-none focus-visible:ring-2 focus-visible:ring-ring',
        disabled && 'opacity-40 pointer-events-none',
        className,
      )}
      {...rest}
    >
      {/* Track */}
      <div ref={trackRef} className="relative h-5.5 w-full">
        <div className="absolute inset-0 rounded-full bg-surface-hover dark:bg-border border border-border-strong/50" />

        {/* Stop markers sit under the fill: filled stops are covered by the accent, so only
            the stops ahead of the thumb show. */}
        {levels.map((level, i) => (
          <StopMarker key={level} denom={denom} index={i} level={level} />
        ))}

        <Progress percent={percent} />

        <Thumb percent={percent} />
      </div>
    </div>
  )
}

type ProgressProps = React.ComponentProps<'div'> & {
  percent: number
}

function Progress({ percent, ...rest }: ProgressProps) {
  const position = calculatePosition(percent / 100) + 0.1

  return (
    <div
      style={{ width: `${position}%` }}
      className={cn(
        'absolute inset-y-0 left-0 z-0 rounded-full bg-brand border border-brand transition-[width,opacity] duration-150 ease-out',
        percent === 0 && 'opacity-0',
      )}
      {...rest}
    />
  )
}

type ThumbProps = React.ComponentProps<'div'> & {
  percent: number
}

function Thumb({ percent, ...rest }: ThumbProps) {
  const position = calculatePosition(percent / 100)

  return (
    <div
      style={{ left: `${position}%` }}
      className={cn(
        'absolute top-1/2 size-7 z-base -translate-x-1/2 -translate-y-1/2 rounded-full',
        'bg-white shadow-sm ring-1 ring-border',
        // Slide to the new stop; `left` and the fill's `width` share timing so the blue edge
        // stays glued to the thumb.
        'hover:scale-110 transition-[left,transform] duration-150 ease-out',
      )}
      {...rest}
    />
  )
}

type StopMarkerProps = React.ComponentProps<'div'> & {
  denom: number
  index: number
  level: Effort
}

function StopMarker({ denom, index, level, ...rest }: StopMarkerProps) {
  const fraction = index / denom
  const position = calculatePosition(fraction)

  return (
    <div
      key={level}
      style={{ left: `${position}%` }}
      className={cn(
        'group absolute top-1/2 z-base -translate-x-1/2 p-1 -translate-y-1/2',
        'flex items-center justify-center',
      )}
    >
      <span
        key={level}
        style={{ left: `${position}%` }}
        className={cn(
          'h-1 w-1 rounded-full bg-subtle/50 dark:bg-border-strong',
          'transition-all duration-200 group-hover:scale-180',
        )}
        {...rest}
      />
    </div>
  )
}

function calculatePosition(percent: number, min?: number, max?: number): number {
  // Min and max at 10% and 90% to avoid the thumb overlapping the first and last markers.
  const _min = min || 0.06
  const _max = max || 0.94
  return (_min + percent * (_max - _min)) * 100
}

const EFFORT_KEYS_IDS = {
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowLeft: 'ArrowLeft',
  ArrowDown: 'ArrowDown',
  Home: 'Home',
  End: 'End',
} as const

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
    case EFFORT_KEYS_IDS.ArrowRight:
    case EFFORT_KEYS_IDS.ArrowUp:
      next = Math.min(i + 1, levels.length - 1)
      break
    case EFFORT_KEYS_IDS.ArrowLeft:
    case EFFORT_KEYS_IDS.ArrowDown:
      next = Math.max(i - 1, 0)
      break
    case EFFORT_KEYS_IDS.Home:
      next = 0
      break
    case EFFORT_KEYS_IDS.End:
      next = levels.length - 1
      break
    default:
      return null
  }

  return next === i ? null : levels[next]
}

// The level a drag lands on, given the pointer's position along the track as a 0..1
// fraction. The fraction is clamped and snapped to the nearest stop, so dragging moves
// discretely between levels. Null when the drag is a no-op (disabled, or an empty scale).
// Pure so the pointer behavior is unit-testable without a DOM.
export function effortForPosition(
  levels: Effort[],
  fraction: number,
  disabled = false,
): Effort | null {
  if (disabled || levels.length === 0) {
    return null
  }

  const clamped = Math.min(1, Math.max(0, fraction))
  const index = Math.round(clamped * (levels.length - 1))

  return levels[index]
}
