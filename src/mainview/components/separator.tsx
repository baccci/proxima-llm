import { cn } from '@utils/tailwind-class-merge'

interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Separator({ orientation = 'horizontal', className = '' }: SeparatorProps) {
  if (orientation === 'horizontal') {
    return <hr className={cn('shrink-0 bg-border h-px w-full border-0', className)} />
  }
  return <div aria-hidden="true" className={cn('shrink-0 bg-border h-full w-px', className)} />
}
