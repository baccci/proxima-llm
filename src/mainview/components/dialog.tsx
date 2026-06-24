import { Dialog } from '@base-ui-components/react'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { IconX } from '@/components/icons/icon-x'

export const DialogRoot = Dialog.Root
export const DialogTrigger = Dialog.Trigger

interface DialogContentProps {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  wide?: boolean
}

export function DialogContent({
  title,
  description,
  children,
  className = '',
  wide,
}: DialogContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 bg-black/50 z-overlay animate-fade-in" />
      <Dialog.Popup
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-modal',
          'rounded-xl border border-border bg-panel shadow-pop outline-none',
          'animate-fade-in-up',
          wide ? 'w-[640px]' : 'w-[480px]',
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between p-5 pb-0">
            <div>
              {title && (
                <Dialog.Title className="text-md font-semibold text-foreground">
                  {title}
                </Dialog.Title>
              )}
              {description && (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close className="ml-4 rounded-lg p-1 text-subtle hover:text-foreground hover:bg-surface-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <IconX width={16} />
            </Dialog.Close>
          </div>
        )}
        <div className="p-5">{children}</div>
      </Dialog.Popup>
    </Dialog.Portal>
  )
}
