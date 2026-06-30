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
        'grid grid-rows-[1fr] transition-[grid-template-rows] duration-200 ease-out',
        'data-starting-style:grid-rows-[0fr] data-ending-style:grid-rows-[0fr]',
        className,
      )}
      {...props}
    >
      <div className="overflow-hidden">{children}</div>
    </Collapsible.Panel>
  )
}
