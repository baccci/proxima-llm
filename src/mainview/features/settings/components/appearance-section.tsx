import { Theme, type UpdateSettingsInput } from '@shared/schemas/settings.schema'
import type React from 'react'
import { IconMonitor } from '@/components/icons/icon-monitor'
import { IconMoon } from '@/components/icons/icon-moon'
import { IconSun } from '@/components/icons/icon-sun'
import { SegmentedControl } from '@/components/segmented-control'
import { Switch } from '@/components/switch'
import { useSettings } from '@/features/settings/hooks/use-settings'
import { settings } from '@/features/settings/settings.api'

const THEMES: { value: Theme; label: string; icon: React.ReactNode }[] = [
  { value: Theme.enum.light, label: '', icon: <IconSun width={14} /> },
  { value: Theme.enum.dark, label: '', icon: <IconMoon width={14} /> },
  { value: Theme.enum.system, label: '', icon: <IconMonitor width={14} /> },
]

export function AppearanceSection() {
  const { data: currentSettings } = useSettings()

  function patch(input: UpdateSettingsInput) {
    settings.update(input)
  }

  return (
    <div className="space-y-5">
      {/* Theme — native-style segmented control */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">Theme</label>
        <SegmentedControl
          options={THEMES}
          value={currentSettings?.theme ?? Theme.enum.system}
          onChange={(value) => patch({ theme: value })}
        />
      </div>

      {/* Send on enter */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Send on Enter</p>
          <p className="text-xs text-subtle mt-0.5">When off, use ⌘+Enter to send</p>
        </div>
        <Switch
          checked={currentSettings?.sendOnEnter ?? true}
          onChange={() => patch({ sendOnEnter: !(currentSettings?.sendOnEnter ?? true) })}
          aria-label="Send on Enter"
        />
      </div>
    </div>
  )
}
