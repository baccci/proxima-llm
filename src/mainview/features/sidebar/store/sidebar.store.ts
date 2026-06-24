import { create } from 'zustand'

interface SidebarState {
  projectsCollapsed: boolean
  pinnedCollapsed: boolean
  toggleProjects: () => void
  togglePinned: () => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  projectsCollapsed: false,
  pinnedCollapsed: false,
  toggleProjects: () => set((s) => ({ projectsCollapsed: !s.projectsCollapsed })),
  togglePinned: () => set((s) => ({ pinnedCollapsed: !s.pinnedCollapsed })),
}))
