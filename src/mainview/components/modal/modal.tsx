import { cn } from '@utils/tailwind-class-merge'
import { AnimatePresence, motion } from 'motion/react'
import React from 'react'
import { createPortal } from 'react-dom'
import { ModalContext, type ModalTheme, useModalContext } from './modal-context'
import { useModalState } from './modal-store'
import { useFocusTrap } from './use-focus-trap'
import { useModalBehavior } from './use-modal-behavior'

export type ModalConfig = {
  dismiss?:
    | boolean
    | {
        onEscape?: boolean
        onOverlayClick?: boolean
      }
  focus?: {
    trap?: boolean
    restore?: boolean
    initial?: React.RefObject<HTMLElement>
  }
  lockScroll?: boolean
}

type BehaviorProps = {
  children: React.ReactNode
  theme?: ModalTheme
  config?: ModalConfig
  overlayClassName?: string
  label?: string
}

type ControlledProps = BehaviorProps & {
  isOpen: boolean
  onClose: () => void
  id?: never
}

type RegisteredProps = BehaviorProps & {
  id: string
  isOpen?: never
  onClose?: never
}

export type ModalProps = ControlledProps | RegisteredProps

type ShellProps = BehaviorProps & {
  isOpen: boolean
  onClose: () => void
}

function resolveDismiss(dismiss: ModalConfig['dismiss']) {
  if (dismiss === false) {
    return { onEscape: false, onOverlayClick: false }
  }
  const overrides = typeof dismiss === 'object' ? dismiss : {}
  return {
    onEscape: overrides.onEscape ?? true,
    onOverlayClick: overrides.onOverlayClick ?? true,
  }
}

function ModalShell({
  isOpen,
  onClose,
  children,
  theme = 'dark',
  config = {},
  overlayClassName,
  label,
}: ShellProps) {
  const [mounted, setMounted] = React.useState(false)
  const overlayRef = React.useRef<HTMLDivElement>(null)
  const isDark = theme === 'dark'

  const dismiss = resolveDismiss(config.dismiss)
  const focusConfig = config.focus ?? {}
  const lockScroll = config.lockScroll ?? true

  const { panelRef } = useModalBehavior({
    isOpen,
    onClose,
    closeOnEscape: dismiss.onEscape,
    lockScroll,
    restoreFocus: focusConfig.restore ?? true,
    initialFocus: focusConfig.initial,
  })
  useFocusTrap(overlayRef, isOpen && (focusConfig.trap ?? true))

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return createPortal(
    <ModalContext.Provider value={{ onClose, theme, label, panelRef }}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'fixed inset-0 z-modal flex items-center justify-center',
              isDark ? 'bg-neutral-950/80 backdrop-blur-sm' : 'bg-neutral-50/80 backdrop-blur-sm',
              overlayClassName,
            )}
            onClick={dismiss.onOverlayClick ? onClose : undefined}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </ModalContext.Provider>,
    document.body,
  )
}

function RegisteredModal({ id, ...rest }: RegisteredProps) {
  const { isOpen, close } = useModalState(id)
  return <ModalShell {...rest} isOpen={isOpen} onClose={close} />
}

function ControlledModal({ id: _id, ...props }: ControlledProps) {
  return <ModalShell {...props} />
}

function ModalRoot(props: ModalProps) {
  if (props.id !== undefined) {
    return <RegisteredModal {...(props as RegisteredProps)} />
  }
  return <ControlledModal {...(props as ControlledProps)} />
}

type ContentProps = {
  children: React.ReactNode
  className?: string
}

function ModalContent({ children, className }: ContentProps) {
  const { panelRef, label } = useModalContext()
  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal
      aria-label={label}
      tabIndex={-1}
      initial={{ scale: 0.93, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.93, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn('relative cursor-default outline-none', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </motion.div>
  )
}

function ModalClose({ className }: { className?: string }) {
  const { onClose, theme } = useModalContext()
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      className={cn(
        'size-9 rounded-full flex items-center justify-center transition-colors duration-150 cursor-pointer',
        isDark
          ? 'bg-neutral-50/10 hover:bg-neutral-50/20 text-neutral-50'
          : 'bg-neutral-950/5 hover:bg-neutral-950/10 text-neutral-950',
        className,
      )}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  )
}

export const Modal = Object.assign(ModalRoot, {
  Content: ModalContent,
  Close: ModalClose,
})
