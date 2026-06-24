import React from 'react'

const openIds = new Set<string>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const modal = {
  open(id: string): void {
    if (openIds.has(id)) {
      return
    }

    openIds.add(id)
    emit()
  },
  close(id: string): void {
    if (!openIds.delete(id)) {
      return
    }

    emit()
  },
  toggle(id: string): void {
    openIds.has(id) ? openIds.delete(id) : openIds.add(id)
    emit()
  },
  closeAll(): void {
    if (openIds.size === 0) {
      return
    }

    openIds.clear()
    emit()
  },
  isOpen(id: string): boolean {
    return openIds.has(id)
  },
}

export function useModalState(id: string) {
  const isOpen = React.useSyncExternalStore(
    subscribe,
    () => openIds.has(id),
    () => false,
  )
  const open = React.useCallback(() => modal.open(id), [id])
  const close = React.useCallback(() => modal.close(id), [id])
  const toggle = React.useCallback(() => modal.toggle(id), [id])
  return { isOpen, open, close, toggle }
}
