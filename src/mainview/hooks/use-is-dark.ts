import React from 'react'

export function useIsDark() {
  return React.useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb)
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      return () => obs.disconnect()
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  )
}
