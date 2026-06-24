import { IconSettings } from '@/components/icons/icon-settings'
import { IconSlidersHorizontal } from '@/components/icons/icon-sliders-horizontal'
import { modal } from '@/components/modal/modal-store'
import { useChatStore } from '@/features/chat/store/chat.store'
import { MARKETPLACE_MODAL_ID } from '@/features/models/components/marketplace.constants'

export function SidebarFooter() {
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)

  return (
    <div className="p-2 border-t border-border shrink-0">
      <button
        onClick={() => modal.open(MARKETPLACE_MODAL_ID)}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
      >
        <IconSlidersHorizontal width={16} className="shrink-0" />
        <span>Models</span>
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer"
      >
        <IconSettings width={16} className="shrink-0" />
        <span>Settings</span>
      </button>
    </div>
  )
}
