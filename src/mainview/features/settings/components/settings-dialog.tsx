import React from 'react'
import { IconBell } from '@/components/icons/icon-bell'
import { IconBrain } from '@/components/icons/icon-brain'
import { IconGlobe } from '@/components/icons/icon-globe'
import { IconKeyRound } from '@/components/icons/icon-key-round'
import { IconPalette } from '@/components/icons/icon-palette'
import { IconSlidersHorizontal } from '@/components/icons/icon-sliders-horizontal'
import { IconWrench } from '@/components/icons/icon-wrench'
import { IconX } from '@/components/icons/icon-x'
import { Modal, modal } from '@/components/modal'
import { ModalNavBody, ModalNavItem } from '@/components/modal/modal-nav'
import { SETTINGS_MODAL_ID } from '../constants/modal'
import { TABS, type Tab } from '../constants/tabs'
import { AdvancedSection } from './advanced-section'
import { AppearanceSection } from './appearance-section'
import { ControlServerSection } from './control-server-section'
import { MemorySection } from './memory-section'
import { NotificationsSection } from './notifications-section'
import { ProvidersSection } from './providers-section'
import { ToolsSection } from './tools-section'

// One row per tab: id, nav label + icon, and the panel it shows. Order here is the display
// order; keep 'advanced' last.
const TABS_ARR: { id: Tab; label: string; icon: React.ReactNode; panel: React.ReactNode }[] = [
  {
    id: TABS.APPEARANCE,
    label: 'Appearance',
    icon: <IconPalette width={15} />,
    panel: <AppearanceSection />,
  },
  {
    id: TABS.PROVIDERS,
    label: 'Providers',
    icon: <IconKeyRound width={15} />,
    panel: <ProvidersSection />,
  },
  { id: TABS.MEMORY, label: 'Memory', icon: <IconBrain width={15} />, panel: <MemorySection /> },
  { id: TABS.TOOLS, label: 'Tools', icon: <IconWrench width={15} />, panel: <ToolsSection /> },
  {
    id: TABS.NOTIFICATIONS,
    label: 'Notifications',
    icon: <IconBell width={15} />,
    panel: <NotificationsSection />,
  },
  {
    id: TABS.CONNECT,
    label: 'Connect',
    icon: <IconGlobe width={15} />,
    panel: <ControlServerSection />,
  },
  {
    id: TABS.ADVANCED,
    label: 'Advanced',
    icon: <IconSlidersHorizontal width={15} />,
    panel: <AdvancedSection />,
  },
]

export function SettingsDialog() {
  const [tab, setTab] = React.useState<Tab>(TABS.APPEARANCE)

  return (
    <Modal id={SETTINGS_MODAL_ID} label="Settings" overlayClassName="bg-black/50">
      <Modal.Content className="w-172 rounded-xl border border-border bg-panel shadow-modal">
        <div className="flex items-start justify-between px-5 pt-5 pb-4">
          <h2 className="text-md font-semibold text-foreground">Settings</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={() => modal.close(SETTINGS_MODAL_ID)}
            className="ml-4 rounded-lg p-1 text-subtle hover:text-foreground hover:bg-surface-hover transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          >
            <IconX width={16} />
          </button>
        </div>

        <ModalNavBody
          nav={TABS_ARR.map((t) => (
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
            {TABS_ARR.find((t) => t.id === tab)?.panel}
          </div>
        </ModalNavBody>
      </Modal.Content>
    </Modal>
  )
}
