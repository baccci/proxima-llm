import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

type Variant = 'default' | 'brand' | 'success' | 'warning' | 'danger'

const variantClasses: Record<Variant, string> = {
  default: 'bg-surface text-muted border border-border',
  brand: 'bg-accent-950 text-accent-300 border border-accent-800',
  success: 'bg-success/10 text-success border border-success/20',
  warning: 'bg-warning/10 text-warning border border-warning/20',
  danger: 'bg-danger/10 text-danger border border-danger/20',
}

interface BadgeProps {
  variant?: Variant
  className?: string
  children: React.ReactNode
}

export function Badge({ variant = 'default', className = '', children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
