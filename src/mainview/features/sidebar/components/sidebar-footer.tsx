import type React from 'react'
import { IconRobotFace } from '@/components/icons/icon-robot-face'
import { IconSettings } from '@/components/icons/icon-settings'
import { modal } from '@/components/modal/modal-store'
import { useChatStore } from '@/features/chat/store/chat.store'
import { MARKETPLACE_MODAL_ID } from '@/features/models/components/marketplace.constants'

type FooterButtonProps = {
  icon: React.ReactNode
  label: string
  onClick: () => void
}

function FooterButton({ icon, label, onClick }: FooterButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-2 h-8 rounded-lg text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export function SidebarFooter() {
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)

  return (
    <div className="p-2 border-t border-border shrink-0">
      <FooterButton
        icon={<IconRobotFace width={15} className="shrink-0" />}
        label="Models"
        onClick={() => modal.open(MARKETPLACE_MODAL_ID)}
      />
      <FooterButton
        icon={<IconSettings width={15} className="shrink-0" />}
        label="Settings"
        onClick={() => setSettingsOpen(true)}
      />
    </div>
  )
}
