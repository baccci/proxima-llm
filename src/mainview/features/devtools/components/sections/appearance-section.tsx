import { Theme } from '@shared/schemas/settings.schema'
import { cn } from '@utils/tailwind-class-merge'
import type React from 'react'
import { IconMonitor } from '@/components/icons/icon-monitor'
import { IconMoon } from '@/components/icons/icon-moon'
import { IconSun } from '@/components/icons/icon-sun'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'
import { DevSection } from '../dev-section'

const THEMES: { value: Theme; icon: React.ReactNode }[] = [
  { value: Theme.enum.light, icon: <IconSun width={13} /> },
  { value: Theme.enum.dark, icon: <IconMoon width={13} /> },
  { value: Theme.enum.system, icon: <IconMonitor width={13} /> },
]

export function AppearanceSection() {
  const { data: currentSettings } = useSettings()
  const theme = currentSettings?.theme ?? Theme.enum.system

  return (
    <DevSection title="Appearance">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/60">Theme</span>
        <div className="inline-flex gap-0.5 rounded-md bg-white/5 p-0.5">
          {THEMES.map((opt) => {
            const active = theme === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => settings.update({ theme: opt.value })}
                aria-label={opt.value}
                className={cn(
                  'flex h-6 w-7 items-center justify-center rounded transition-colors',
                  active && 'bg-white/15 text-white',
                  !active && 'text-white/40 hover:text-white/80 cursor-pointer',
                )}
              >
                {opt.icon}
              </button>
            )
          })}
        </div>
      </div>
    </DevSection>
  )
}
