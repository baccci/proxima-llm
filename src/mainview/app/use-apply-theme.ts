import { Theme } from '@shared/schemas/settings.schema'
import React from 'react'
import { useSettings } from '@/features/settings/hooks/use-settings'

const DARK_QUERY = '(prefers-color-scheme: dark)'

// The saved theme is cached here on every change so the boot script in
// index.html can apply <html class="dark"> before React mounts, avoiding a flash
// of the wrong theme on cold start. Keep this key and the resolve rule below in
// sync with that script.
const THEME_CACHE_KEY = 'theme'

function resolveDark(theme: Theme): boolean {
  if (theme === Theme.enum.system) {
    return window.matchMedia(DARK_QUERY).matches
  }

  return theme === Theme.enum.dark
}

// Syncs the saved theme onto <html class="dark"> and caches it for the boot
// script. This is an external-DOM side-effect (not derivable render state), so an
// effect is the right tool here.
export function useApplyTheme() {
  const theme = useSettings().data?.theme

  React.useEffect(() => {
    // Until settings load, the boot script's cached class already holds the right
    // theme, so don't overwrite it with the loading fallback.
    if (!theme) {
      return
    }

    localStorage.setItem(THEME_CACHE_KEY, theme)

    const apply = () => document.documentElement.classList.toggle('dark', resolveDark(theme))
    apply()

    if (theme !== Theme.enum.system) {
      return
    }

    const mq = window.matchMedia(DARK_QUERY)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
