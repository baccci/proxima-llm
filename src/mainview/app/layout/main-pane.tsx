import { AllChatsView } from '@/features/chat/components/all-chats-view'
import { ChatView } from '@/features/chat/components/chat-view'
import { useChatStore } from '@/features/chat/store/chat.store'
import { FocusModeOverlay } from '@/features/focus-mode/components/focus-mode-overlay'
import { ModelsMarketplace } from '@/features/models/components/models-marketplace'
import { ProjectView } from '@/features/projects/components/project-view'
import { SettingsDialog } from '@/features/settings/components/settings-dialog'

export function MainPane() {
  const focusModeOpen = useChatStore((s) => s.focusModeOpen)

  return (
    <>
      <MainContent />
      <SettingsDialog />
      <ModelsMarketplace />
      {focusModeOpen && <FocusModeOverlay />}
    </>
  )
}

// The single main-content surface. The All-chats view takes precedence, then a project
// (when no chat is open under it), otherwise the chat view.
function MainContent() {
  const viewingAllChats = useChatStore((s) => s.viewingAllChats)
  const selectedProjectId = useChatStore((s) => s.selectedProjectId)
  const selectedChatId = useChatStore((s) => s.selectedChatId)

  if (viewingAllChats) {
    return <AllChatsView scope={viewingAllChats.projectId} />
  }
  if (selectedProjectId && !selectedChatId) {
    return <ProjectView projectId={selectedProjectId} />
  }
  return <ChatView />
}
