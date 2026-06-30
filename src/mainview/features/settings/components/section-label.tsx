import type React from 'react'
import { cn } from '@/utils/tailwind-class-merge'

type SectionLabelProps = React.ComponentProps<'p'>

export const SectionLabel: React.FC<SectionLabelProps> = ({ className, children, ...props }) => {
  return (
    <p
      className={cn(className, 'text-xs font-semibold uppercase tracking-wider text-subtle')}
      {...props}
    >
      {children}
    </p>
  )
}
