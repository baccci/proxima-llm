import { create } from 'zustand'

type LayoutState = {
  sidebarOpen: boolean
  toggleSidebar: () => void
}

// Whether the shell shows the sidebar. This is the shell's state, not the sidebar's:
// app.tsx decides whether the sidebar mounts at all, and the chat and project headers
// inset themselves while it is closed.
export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
