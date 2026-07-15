import type React from 'react'
import { cn } from '@/utils/tailwind-class-merge'

type ComposerButtonProps = React.ComponentProps<'button'>

export function ComposerButton({ onClick, className, children, ...props }: ComposerButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        className,
        'flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition cursor-pointer pointer-fine:active:transform-[scale(0.97)]',
      )}
      {...props}
    >
      {children}
    </button>
  )
}
