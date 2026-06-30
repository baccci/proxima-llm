import { IconRobotFace } from '@/components/icons/icon-robot-face'
import { IconSettings } from '@/components/icons/icon-settings'
import { modal } from '@/components/modal/modal-store'
import { useChatStore } from '@/features/chat/store/chat.store'
import { MARKETPLACE_MODAL_ID } from '@/features/models/components/marketplace.constants'

export function SidebarFooter() {
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)

  return (
    <div className="p-2 border-t border-border shrink-0">
      <button
        onClick={() => modal.open(MARKETPLACE_MODAL_ID)}
        className="flex items-center gap-2 w-full px-2 h-8 rounded-lg text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconRobotFace width={15} className="shrink-0" />
        <span>Models</span>
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex items-center gap-2 w-full px-2 h-8 rounded-lg text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconSettings width={15} className="shrink-0" />
        <span>Settings</span>
      </button>
    </div>
  )
}
