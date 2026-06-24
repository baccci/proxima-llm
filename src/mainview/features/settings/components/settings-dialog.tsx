import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconKeyRound } from '@/components/icons/icon-key-round'
import { IconPalette } from '@/components/icons/icon-palette'
import { IconSlidersHorizontal } from '@/components/icons/icon-sliders-horizontal'
import { IconWrench } from '@/components/icons/icon-wrench'
import { IconX } from '@/components/icons/icon-x'
import { Modal } from '@/components/modal'
import { Separator } from '@/components/separator'
import { useChatStore } from '@/features/chat/store/chat.store'
import { AdvancedSection } from './advanced-section'
import { ApiKeysSection } from './api-keys-section'
import { AppearanceSection } from './appearance-section'
import { ControlServerSection } from './control-server-section'
import { ToolsSection } from './tools-section'

type Tab = 'api-keys' | 'appearance' | 'advanced' | 'tools' | 'connect'

// Tabs render in array order EXCEPT 'advanced', which is always pinned LAST (see ORDERED_TABS).
// Add new tabs anywhere in this array — they will appear above Advanced automatically.
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'api-keys', label: 'API Keys', icon: <IconKeyRound width={15} /> },
  { id: 'appearance', label: 'Appearance', icon: <IconPalette width={15} /> },
  { id: 'tools', label: 'Tools', icon: <IconWrench width={15} /> },
  { id: 'connect', label: 'Connect', icon: <IconGlobe width={15} /> },
  { id: 'advanced', label: 'Advanced', icon: <IconSlidersHorizontal width={15} /> },
]

// 'advanced' must always be the final tab. New tabs go above it; this keeps that invariant
// even if someone appends a tab after 'advanced'.
const ORDERED_TABS = [
  ...TABS.filter((t) => t.id !== 'advanced'),
  ...TABS.filter((t) => t.id === 'advanced'),
]

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useChatStore()
  const [tab, setTab] = React.useState<Tab>('api-keys')

  return (
    <Modal
      isOpen={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      label="Settings"
      overlayClassName="bg-black/50"
    >
      <Modal.Content className="w-[640px] rounded-xl border border-border bg-panel shadow-pop">
        <div className="flex items-start justify-between p-5 pb-0">
          <h2 className="text-md font-semibold text-foreground">Settings</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSettingsOpen(false)}
            className="ml-4 rounded-lg p-1 text-subtle hover:text-foreground hover:bg-surface-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <IconX width={16} />
          </button>
        </div>

        <div className="flex gap-5 p-5 -mt-2">
          <nav className="w-36 shrink-0 -ml-1 flex flex-col gap-0.5">
            {ORDERED_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer',
                  tab === t.id
                    ? 'bg-surface-hover text-foreground font-medium'
                    : 'text-muted hover:bg-surface-hover hover:text-foreground',
                )}
              >
                <span className="shrink-0 text-subtle">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <Separator orientation="vertical" className="h-auto" />

          <div className="flex-1 min-w-0 h-[440px] overflow-y-auto pr-1">
            {tab === 'api-keys' && <ApiKeysSection />}
            {tab === 'appearance' && <AppearanceSection />}
            {tab === 'advanced' && <AdvancedSection />}
            {tab === 'tools' && <ToolsSection />}
            {tab === 'connect' && <ControlServerSection />}
          </div>
        </div>
      </Modal.Content>
    </Modal>
  )
}
