import { ChatView } from '@/features/chat/components/chat-view'
import { useChatStore } from '@/features/chat/store/chat.store'
import { FocusModeOverlay } from '@/features/focus-mode/components/focus-mode-overlay'
import { ModelsMarketplace } from '@/features/models/components/models-marketplace'
import { ProjectView } from '@/features/projects/components/project-view'
import { SettingsDialog } from '@/features/settings/components/settings-dialog'

export function MainPane() {
  const focusModeOpen = useChatStore((s) => s.focusModeOpen)
  const selectedProjectId = useChatStore((s) => s.selectedProjectId)
  const selectedChatId = useChatStore((s) => s.selectedChatId)

  return (
    <>
      {selectedProjectId && !selectedChatId ? (
        <ProjectView projectId={selectedProjectId} />
      ) : (
        <ChatView />
      )}
      <SettingsDialog />
      <ModelsMarketplace />
      {focusModeOpen && <FocusModeOverlay />}
    </>
  )
}
