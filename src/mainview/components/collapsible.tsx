import { Collapsible } from '@base-ui-components/react'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

export const CollapsibleRoot = Collapsible.Root

interface CollapsibleTriggerProps
  extends React.ComponentPropsWithoutRef<typeof Collapsible.Trigger> {
  className?: string
}

export function CollapsibleTrigger({
  className = '',
  children,
  ...props
}: CollapsibleTriggerProps) {
  return (
    <Collapsible.Trigger
      className={cn(
        'flex items-center gap-2 w-full outline-none cursor-pointer select-none',
        'focus-visible:ring-2 focus-visible:ring-ring rounded',
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible.Trigger>
  )
}

interface CollapsiblePanelProps extends React.ComponentPropsWithoutRef<typeof Collapsible.Panel> {
  className?: string
}

export function CollapsiblePanel({ className = '', children, ...props }: CollapsiblePanelProps) {
  return (
    <Collapsible.Panel
      className={cn(
        'overflow-hidden',
        'data-starting-style:h-0 data-ending-style:h-0',
        'transition-[height] duration-200 ease-out',
        className,
      )}
      {...props}
    >
      {children}
    </Collapsible.Panel>
  )
}
