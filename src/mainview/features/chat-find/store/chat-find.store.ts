import { create } from 'zustand'

type ChatFindState = {
  isOpen: boolean
  query: string
  // Which match is the current one, as an index into the match list. The list is derived
  // from the messages rather than stored, because it is not UI state: it is a pure
  // function of the open chat and the query. Readers clamp this, since the list shrinks
  // as the query narrows.
  activeIndex: number
  // Bumped every time the find shortcut fires. The bar watches it so Cmd+F re-focuses and
  // re-selects the field when the bar is already open, the way a browser find does.
  focusRequestId: number

  open: () => void
  close: () => void
  setQuery: (query: string) => void
  step: (delta: number, total: number) => void
  reset: () => void
}

// In-chat find: the query, which match is current, and whether the bar is showing. Its
// own store rather than a corner of chat.store, so the hottest store in the renderer does
// not grow a second unrelated tenant. UI state only, per docs/conventions/data-and-state.
export const useChatFindStore = create<ChatFindState>((set) => ({
  isOpen: false,
  query: '',
  activeIndex: 0,
  focusRequestId: 0,

  // The query survives a close, so reopening offers the last thing searched for. Only the
  // position resets, because the message list may have grown since.
  open: () => set((s) => ({ isOpen: true, activeIndex: 0, focusRequestId: s.focusRequestId + 1 })),
  close: () => set({ isOpen: false }),
  setQuery: (query) => set({ query, activeIndex: 0 }),
  // Next and previous wrap around, so holding Enter cycles the chat rather than stopping
  // dead at the last match.
  step: (delta, total) =>
    set((s) => (total === 0 ? s : { activeIndex: (s.activeIndex + delta + total) % total })),
  reset: () => set({ isOpen: false, query: '', activeIndex: 0 }),
}))
