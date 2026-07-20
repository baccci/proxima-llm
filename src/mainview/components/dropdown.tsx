import { Menu } from '@base-ui-components/react'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'

export const DropdownRoot = Menu.Root
export const DropdownTrigger = Menu.Trigger
export const DropdownPortal = Menu.Portal

export function DropdownContent({
  children,
  className = '',
  elevated = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof Menu.Positioner> & { elevated?: boolean }) {
  return (
    <Menu.Positioner {...props} sideOffset={6} className={elevated ? 'z-popover' : 'z-dropdown'}>
      <Menu.Popup
        className={cn(
          'min-w-40 rounded-xl border border-border bg-surface shadow-pop p-1',
          'outline-none origin-(--transform-origin)',
          'data-starting-style:opacity-0 data-starting-style:transform-[scale(0.97)]',
          'data-ending-style:opacity-0 data-ending-style:transform-[scale(0.97)]',
          'transition-[opacity,transform] duration-150 ease-out',
          'max-h-[min(24rem,var(--available-height))] overflow-y-auto',
          className,
        )}
      >
        {children}
      </Menu.Popup>
    </Menu.Positioner>
  )
}

type DropdownItemProps = React.ComponentPropsWithoutRef<typeof Menu.Item> & {
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
        'data-highlighted:bg-surface-hover transition-colors',
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

type DropdownSwitchItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof Menu.CheckboxItem>,
  'onCheckedChange'
> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  icon?: React.ReactNode
  disabled?: boolean
}

// A menu row that toggles a boolean via a switch on the right. Built on
// Menu.CheckboxItem (keyboard nav + highlight); closeOnClick=false keeps the
// menu open so several toggles can be flipped in one visit. The switch itself is
// presentational — the CheckboxItem owns the click.
export function DropdownSwitchItem({
  checked,
  onCheckedChange,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: DropdownSwitchItemProps) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      closeOnClick={false}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none cursor-pointer select-none',
        'data-highlighted:bg-surface-hover transition-colors text-foreground',
        'data-disabled:opacity-40 data-disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0 text-muted">{icon}</span>}
      <span className="flex-1">{children}</span>
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors pointer-events-none',
          checked ? 'bg-brand' : 'bg-surface-hover',
        )}
      >
        <span
          className={cn(
            'block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </Menu.CheckboxItem>
  )
}

export const DropdownSubmenuRoot = Menu.SubmenuRoot
export const DropdownSubmenuTrigger = Menu.SubmenuTrigger

type DropdownRadioGroupProps = {
  value: string | null
  onValueChange: (value: string | null) => void
  children: React.ReactNode
}

export function DropdownRadioGroup({ value, onValueChange, children }: DropdownRadioGroupProps) {
  return (
    <Menu.RadioGroup value={value} onValueChange={(v) => onValueChange(v as string | null)}>
      {children}
    </Menu.RadioGroup>
  )
}

type DropdownRadioItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof Menu.RadioItem>,
  'value'
> & {
  value: string | null
  disabled?: boolean
}

export function DropdownRadioItem({
  value,
  children,
  className = '',
  disabled,
  ...props
}: DropdownRadioItemProps) {
  return (
    <Menu.RadioItem
      value={value}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none cursor-pointer select-none',
        'data-highlighted:bg-surface-hover transition-colors text-foreground',
        'data-disabled:opacity-40 data-disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        <Menu.RadioItemIndicator className="h-1.5 w-1.5 rounded-full bg-foreground" />
      </span>
      <span className="flex-1">{children}</span>
    </Menu.RadioItem>
  )
}
