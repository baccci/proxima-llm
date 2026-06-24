import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

interface ScrollAreaProps {
  children: React.ReactNode
  className?: string
}

export function ScrollArea({ children, className = '' }: ScrollAreaProps) {
  return <div className={cn('overflow-y-auto overflow-x-hidden', className)}>{children}</div>
}
