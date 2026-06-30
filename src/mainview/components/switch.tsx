import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

// onChange is overridden to a plain callback (the native ChangeEvent signature
// doesn't fit a toggle), so it's omitted from the inherited button props.
type SwitchProps = Omit<React.ComponentProps<'button'>, 'onChange'> & {
  checked: boolean
  onChange: () => void
  // Override the default brand track / white thumb (e.g. with a provider color).
  activeColor?: string
  thumbColor?: string
}

export function Switch({
  checked,
  onChange,
  disabled,
  className,
  activeColor,
  thumbColor,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      style={checked && activeColor ? { backgroundColor: activeColor } : undefined}
      {...props}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:opacity-40 disabled:pointer-events-none',
        // Extend the hit target to ~36px without affecting layout
        "before:absolute before:-inset-2 before:content-['']",
        checked ? 'bg-brand' : 'bg-surface-hover',
        className,
      )}
    >
      <span
        style={checked && thumbColor ? { backgroundColor: thumbColor } : undefined}
        className={cn(
          'pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
