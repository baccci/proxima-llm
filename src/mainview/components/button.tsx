import { cn } from '@utils/tailwind-class-merge'
import React from 'react'

type Variant = 'default' | 'ghost' | 'outline' | 'brand' | 'danger'
type Size = 'sm' | 'md' | 'icon-sm' | 'icon-md'

const variantClasses: Record<Variant, string> = {
  default: 'bg-surface hover:bg-surface-hover text-foreground border border-border',
  ghost: 'hover:bg-surface-hover text-muted hover:text-foreground',
  outline: 'border border-border hover:bg-surface-hover text-foreground',
  brand: 'bg-brand hover:bg-brand-hover text-brand-foreground',
  danger: 'bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  'icon-sm': 'h-7 w-7',
  'icon-md': 'h-8 w-8',
}

type ButtonProps = React.ComponentProps<'button'> & {
  variant?: Variant
  size?: Size
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition pointer-fine:active:transform-[scale(0.97)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-40 cursor-pointer select-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
)

Button.displayName = 'Button'
