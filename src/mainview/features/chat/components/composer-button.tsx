import type React from 'react'
import { cn } from '@/utils/tailwind-class-merge'

type ComposerButtonProps = React.ComponentProps<'button'>

// The round brand-colored action button in the composer toolbar (send / stop).
export function ComposerButton({ className, children, ...props }: ComposerButtonProps) {
  return (
    <button
      className={cn(
        'flex items-center justify-center h-8 w-8 rounded-full bg-brand text-brand-foreground hover:bg-brand-hover transition cursor-pointer pointer-fine:active:transform-[scale(0.97)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
