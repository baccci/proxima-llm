import { create } from 'zustand'

// A message the message list should land on once its chat is open, set when a search
// hit is picked. Cleared by any other navigation, so returning to the chat later opens
// it normally at the newest message.
type PendingScroll = {
  chatId: string
  messageId: string
}

type NavigationState = {
  selectedChatId: string | null
  selectedProjectId: string | null
  pendingScroll: PendingScroll | null
  // The full-page All-chats view, scoped global (projectId null) or to a project.
  // Null means the view is closed. Selecting a chat or project clears it.
  viewingAllChats: { projectId: string | null } | null

  selectChat: (id: string | null) => void
  openChatAtMessage: (chatId: string, messageId: string | null) => void
  selectProject: (id: string) => void
  openAllChats: (projectId: string | null) => void
}

// What the shell is showing. It holds the destination and nothing else: a feature with
// state tied to the open chat listens for selectedChatId changes and resets itself, so
// navigation never has to know which features those are.
export const useNavigationStore = create<NavigationState>((set) => ({
  selectedChatId: null,
  selectedProjectId: null,
  pendingScroll: null,
  viewingAllChats: null,

  selectChat: (id) => set({ selectedChatId: id, pendingScroll: null, viewingAllChats: null }),
  // Open a chat from a search hit. A title hit carries no message, so it opens the chat
  // the ordinary way at the newest message.
  openChatAtMessage: (chatId, messageId) =>
    set({
      selectedChatId: chatId,
      pendingScroll: messageId === null ? null : { chatId, messageId },
      viewingAllChats: null,
    }),
  selectProject: (id) =>
    set({
      selectedProjectId: id,
      selectedChatId: null,
      pendingScroll: null,
      viewingAllChats: null,
    }),
  openAllChats: (projectId) => set({ viewingAllChats: { projectId } }),
}))
