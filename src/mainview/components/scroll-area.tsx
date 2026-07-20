import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

type ScrollAreaProps = React.ComponentProps<'div'>

export function ScrollArea({ children, className = '', ...props }: ScrollAreaProps) {
  return (
    <div {...props} className={cn('overflow-y-auto overflow-x-hidden', className)}>
      {children}
    </div>
  )
}
