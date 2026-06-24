import React from 'react'
import { useSettings } from '@/features/settings/hooks/use-settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function resolveDark(theme: 'light' | 'dark' | 'system'): boolean {
  if (theme === 'system') return window.matchMedia(DARK_QUERY).matches
  return theme === 'dark'
}

// Syncs the saved theme onto <html class="dark">. This is an external-DOM side-effect
// (not derivable render state), so an effect is the right tool here — see docs/react.md.
export function useApplyTheme() {
  const theme = useSettings().data?.theme ?? 'system'

  React.useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', resolveDark(theme))
    apply()
    if (theme !== 'system') return
    const mq = window.matchMedia(DARK_QUERY)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
