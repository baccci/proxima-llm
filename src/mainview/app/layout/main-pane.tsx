import { ChatView } from '@/features/chat/components/chat-view'
import { useChatStore } from '@/features/chat/store/chat.store'
import { FocusModeOverlay } from '@/features/focus-mode/components/focus-mode-overlay'
import { ModelsMarketplace } from '@/features/models/components/models-marketplace'
import { SettingsDialog } from '@/features/settings/components/settings-dialog'

export function MainPane() {
  const focusModeOpen = useChatStore((s) => s.focusModeOpen)

  return (
    <>
      <ChatView />
      <SettingsDialog />
      <ModelsMarketplace />
      {focusModeOpen && <FocusModeOverlay />}
    </>
  )
}
