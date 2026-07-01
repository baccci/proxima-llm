import { Popover } from '@base-ui-components/react'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

export const PopoverRoot = Popover.Root
export const PopoverTrigger = Popover.Trigger

export function PopoverContent({
  children,
  className = '',
  ...props
}: React.ComponentPropsWithoutRef<typeof Popover.Positioner>) {
  return (
    <Popover.Portal>
      <Popover.Positioner {...props} sideOffset={6} className="z-popover">
        <Popover.Popup
          className={cn(
            'rounded-xl border border-border bg-surface shadow-pop p-3',
            'outline-none origin-(--transform-origin)',
            'data-starting-style:opacity-0 data-starting-style:transform-[scale(0.97)]',
            'data-ending-style:opacity-0 data-ending-style:transform-[scale(0.97)]',
            'transition-[opacity,transform] duration-150 ease-out',
            'max-h-[min(28rem,var(--available-height))] overflow-y-auto',
            className,
          )}
        >
          {children}
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  )
}
