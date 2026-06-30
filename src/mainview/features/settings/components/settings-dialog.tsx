import React from 'react'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconKeyRound } from '@/components/icons/icon-key-round'
import { IconPalette } from '@/components/icons/icon-palette'
import { IconSlidersHorizontal } from '@/components/icons/icon-sliders-horizontal'
import { IconWrench } from '@/components/icons/icon-wrench'
import { IconX } from '@/components/icons/icon-x'
import { Modal } from '@/components/modal'
import { ModalNavBody, ModalNavItem } from '@/components/modal/modal-nav'
import { useChatStore } from '@/features/chat/store/chat.store'
import { TABS, type Tab } from '../constants/tabs'
import { AdvancedSection } from './advanced-section'
import { AppearanceSection } from './appearance-section'
import { ControlServerSection } from './control-server-section'
import { MemorySection } from './memory-section'
import { ProvidersSection } from './providers-section'
import { ToolsSection } from './tools-section'

// Tabs render in array order EXCEPT 'advanced', which is always pinned LAST (see ORDERED_TABS).
// Add new tabs anywhere in this array — they will appear above Advanced automatically.
export const TABS_ARR: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <IconPalette width={15} /> },
  { id: 'providers', label: 'Providers', icon: <IconKeyRound width={15} /> },
  { id: 'memory', label: 'Memory', icon: <IconBrain width={15} /> },
  { id: 'tools', label: 'Tools', icon: <IconWrench width={15} /> },
  { id: 'connect', label: 'Connect', icon: <IconGlobe width={15} /> },
  { id: 'advanced', label: 'Advanced', icon: <IconSlidersHorizontal width={15} /> },
]

// 'advanced' must always be the final tab. New tabs go above it; this keeps that invariant
// even if someone appends a tab after 'advanced'.
const ORDERED_TABS = [
  ...TABS_ARR.filter((t) => t.id !== 'advanced'),
  ...TABS_ARR.filter((t) => t.id === 'advanced'),
]

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useChatStore()
  const [tab, setTab] = React.useState<Tab>('appearance')

  return (
    <Modal
      isOpen={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      label="Settings"
      overlayClassName="bg-black/50"
    >
      <Modal.Content className="w-172 rounded-xl border border-border bg-panel shadow-modal">
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
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

        <ModalNavBody
          nav={ORDERED_TABS.map((t) => (
            <ModalNavItem
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
              icon={t.icon}
            >
              {t.label}
            </ModalNavItem>
          ))}
        >
          <div className="h-[528px] overflow-y-auto overflow-x-clip px-1 pb-1">
            {tab === TABS.APPEARANCE && <AppearanceSection />}
            {tab === TABS.PROVIDERS && <ProvidersSection />}
            {tab === TABS.MEMORY && <MemorySection />}
            {tab === TABS.ADVANCED && <AdvancedSection />}
            {tab === TABS.TOOLS && <ToolsSection />}
            {tab === TABS.CONNECT && <ControlServerSection />}
          </div>
        </ModalNavBody>
      </Modal.Content>
    </Modal>
  )
}
