import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { Separator } from '@/components/separator'

type ModalNavBodyProps = {
  nav: React.ReactNode
  children: React.ReactNode
}

// Shared two-column shell (side-nav + separator + content) for the settings and
// models modals — keeps their padding rhythm identical instead of drifting via
// per-modal negative-margin hacks. Pairs with a header padded `px-5 pt-5 pb-4`.
export function ModalNavBody({ nav, children }: ModalNavBodyProps) {
  return (
    <div className="flex gap-5 px-5 pb-5">
      <nav className="w-36 shrink-0 -ml-1 flex flex-col gap-0.5">{nav}</nav>
      <Separator orientation="vertical" className="h-auto" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

type ModalNavItemProps = {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}

export function ModalNavItem({ active, onClick, icon, children }: ModalNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left',
        active
          ? 'bg-surface-hover text-foreground font-medium'
          : 'text-muted hover:bg-surface-hover hover:text-foreground',
      )}
    >
      {icon && <span className="shrink-0 text-subtle">{icon}</span>}
      {children}
    </button>
  )
}
