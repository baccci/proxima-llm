import type React from 'react'
import { cn } from '@/utils/tailwind-class-merge'

type SectionLabelProps = React.ComponentProps<'p'>

export function SectionLabel({ className, children, ...props }: SectionLabelProps) {
  return (
    <p
      className={cn('text-xs font-semibold uppercase tracking-wider text-subtle', className)}
      {...props}
    >
      {children}
    </p>
  )
}
