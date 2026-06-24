import { cn } from '@utils/tailwind-class-merge'
import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground',
        'placeholder:text-subtle outline-none transition-colors',
        'focus:border-brand focus:ring-2 focus:ring-ring',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  ),
)

Input.displayName = 'Input'
