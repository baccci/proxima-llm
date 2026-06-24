import { Menu } from '@base-ui-components/react'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

export const DropdownRoot = Menu.Root
export const DropdownTrigger = Menu.Trigger
export const DropdownPortal = Menu.Portal

export function DropdownContent({
  children,
  className = '',
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Positioner>) {
  return (
    <Menu.Positioner {...props} sideOffset={6} className="z-dropdown">
      <Menu.Popup
        className={cn(
          'min-w-40 rounded-xl border border-border bg-elevated shadow-pop p-1',
          'outline-none animate-fade-in-up',
          'max-h-[min(24rem,var(--available-height))] overflow-y-auto',
          className,
        )}
      >
        {children}
      </Menu.Popup>
    </Menu.Positioner>
  )
}

interface DropdownItemProps extends React.ComponentPropsWithoutRef<typeof Menu.Item> {
  icon?: React.ReactNode
  shortcut?: string
  danger?: boolean
}

export function DropdownItem({
  icon,
  shortcut,
  danger,
  children,
  className = '',
  ...props
}: DropdownItemProps) {
  return (
    <Menu.Item
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none cursor-pointer select-none',
        'data-highlighted:bg-white/6 transition-colors',
        danger ? 'text-danger' : 'text-foreground',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-subtle font-mono">{shortcut}</span>}
    </Menu.Item>
  )
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />
}

export function DropdownGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <Menu.Group>
      {label && (
        <Menu.GroupLabel className="px-2.5 py-1 text-2xs font-semibold text-subtle uppercase tracking-wider">
          {label}
        </Menu.GroupLabel>
      )}
      {children}
    </Menu.Group>
  )
}
