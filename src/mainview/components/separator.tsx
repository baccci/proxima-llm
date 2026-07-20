import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

type SeparatorProps = React.HTMLAttributes<HTMLElement> & {
  orientation?: 'horizontal' | 'vertical'
}

export function Separator({
  orientation = 'horizontal',
  className = '',
  ...props
}: SeparatorProps) {
  if (orientation === 'horizontal') {
    return <hr {...props} className={cn('shrink-0 bg-border h-px w-full border-0', className)} />
  }

  return (
    <div
      aria-hidden="true"
      {...props}
      className={cn('shrink-0 bg-border h-full w-px', className)}
    />
  )
}
