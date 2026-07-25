import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

type SegmentedOption<T extends string> = {
  value: T
  label: string
  icon?: React.ReactNode
}

type SegmentedControlProps<T extends string> = {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 h-7 rounded-md text-sm transition-colors cursor-pointer flex items-center gap-1.5',
            value === opt.value
              ? 'bg-surface-hover text-foreground font-medium'
              : 'text-muted hover:text-foreground',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
