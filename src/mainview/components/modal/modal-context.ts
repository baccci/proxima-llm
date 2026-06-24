import React from 'react'

export type ModalTheme = 'dark' | 'light'

type ModalContextValue = {
  onClose: () => void
  theme: ModalTheme
  label?: string
  panelRef: React.RefObject<HTMLDivElement>
}

const ModalContext = React.createContext<ModalContextValue | null>(null)

export function useModalContext(): ModalContextValue {
  const ctx = React.useContext(ModalContext)

  if (!ctx) {
    throw new Error('Modal compound parts must be used inside <Modal>')
  }

  return ctx
}

export { ModalContext }
