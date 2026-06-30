import { Tooltip } from '@base-ui-components/react'
import type React from 'react'

interface TooltipWrapperProps {
  content: React.ReactNode
  children: React.ReactElement
  side?: 'top' | 'right' | 'bottom' | 'left'
  delay?: number
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <Tooltip.Provider delay={400}>{children}</Tooltip.Provider>
}

export function TooltipWrapper({ content, children, side = 'top' }: TooltipWrapperProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6} className="z-tooltip">
          <Tooltip.Popup className="rounded-lg bg-elevated border border-border shadow-pop px-2.5 py-1.5 text-xs text-foreground origin-(--transform-origin) data-starting-style:opacity-0 data-starting-style:transform-[scale(0.97)] data-ending-style:opacity-0 data-ending-style:transform-[scale(0.97)] transition-[opacity,transform] duration-125 ease-out">
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
