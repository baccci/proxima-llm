import React from 'react'
import { useSettings } from '@/features/settings/hooks/use-settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function resolveDark(theme: 'light' | 'dark' | 'system'): boolean {
  if (theme === 'system') return window.matchMedia(DARK_QUERY).matches
  return theme === 'dark'
}

// Mirrors use-apply-theme.ts so palette resolution matches the applied <html class="dark">
// state, including live changes when the OS theme flips under 'system'.
export function useIsDark(): boolean {
  const theme = useSettings().data?.theme ?? 'system'
  const [isDark, setIsDark] = React.useState(() => resolveDark(theme))

  React.useEffect(() => {
    setIsDark(resolveDark(theme))
    if (theme !== 'system') return
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = () => setIsDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  return isDark
}
