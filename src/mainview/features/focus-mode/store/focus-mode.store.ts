import { create } from 'zustand'

// A chat a prompt arrived for while focus mode was open on a different one, so the
// overlay can offer to jump into it.
type PendingIncoming = {
  chatId: string
  streamId: string
  assistantMessageId: string
}

type FocusModeState = {
  isOpen: boolean
  exchangeIndex: number
  showPrompt: boolean
  pendingIncoming: PendingIncoming | null

  open: (atExchange: number) => void
  close: () => void
  setExchangeIndex: (i: number) => void
  setShowPrompt: (show: boolean) => void
  setPendingIncoming: (p: PendingIncoming | null) => void
}

export const useFocusModeStore = create<FocusModeState>((set) => ({
  isOpen: false,
  exchangeIndex: 0,
  showPrompt: false,
  pendingIncoming: null,

  // Entering and leaving both drop a pending banner, so it can never outlive the
  // session that raised it.
  open: (atExchange) => set({ isOpen: true, exchangeIndex: atExchange, pendingIncoming: null }),
  close: () => set({ isOpen: false, pendingIncoming: null }),
  setExchangeIndex: (i) => set({ exchangeIndex: i }),
  setShowPrompt: (show) => set({ showPrompt: show }),
  setPendingIncoming: (p) => set({ pendingIncoming: p }),
}))
