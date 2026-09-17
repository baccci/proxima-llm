import { AllChatsView } from '@/features/chat/components/chat-list/all-chats-view'
import { SearchPalette } from '@/features/chat/components/chat-search/search-palette'
import { ChatView } from '@/features/chat/components/chat-view'
import { useSearchShortcut } from '@/features/chat/hooks/use-search-shortcut'
import { FocusModeOverlay } from '@/features/focus-mode/components/focus-mode-overlay'
import { useFocusModeStore } from '@/features/focus-mode/store/focus-mode.store'
import { ModelsMarketplace } from '@/features/models/components/models-marketplace'
import { ProjectView } from '@/features/projects/components/project-view'
import { SettingsDialog } from '@/features/settings/components/settings-dialog'
import { useNavigationStore } from '@/store/navigation.store'

export function MainPane() {
  const focusModeOpen = useFocusModeStore((s) => s.isOpen)
  useSearchShortcut()

  return (
    <>
      <MainContent />
      <SearchPalette />
      <SettingsDialog />
      <ModelsMarketplace />
      {focusModeOpen && <FocusModeOverlay />}
    </>
  )
}

// The single main-content surface. The All-chats view takes precedence, then a project
// (when no chat is open under it), otherwise the chat view.
function MainContent() {
  const viewingAllChats = useNavigationStore((s) => s.viewingAllChats)
  const selectedProjectId = useNavigationStore((s) => s.selectedProjectId)
  const selectedChatId = useNavigationStore((s) => s.selectedChatId)

  if (viewingAllChats) {
    return <AllChatsView scope={viewingAllChats.projectId} />
  }
  if (selectedProjectId && !selectedChatId) {
    return <ProjectView projectId={selectedProjectId} />
  }
  return <ChatView />
}
