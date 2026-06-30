import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DevtoolsState {
  isOpen: boolean
  position: { x: number; y: number }
  compactionRatio: number
  forcedTokens: number | null
  toggle: () => void
  setPosition: (pos: { x: number; y: number }) => void
  setCompactionRatio: (ratio: number) => void
  setForcedTokens: (tokens: number | null) => void
}

export const useDevtoolsStore = create<DevtoolsState>()(
  persist(
    (set) => ({
      isOpen: false,
      position: { x: 16, y: 80 },
      compactionRatio: 0.8,
      forcedTokens: null,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      setPosition: (position) => set({ position }),
      setCompactionRatio: (compactionRatio) => set({ compactionRatio }),
      setForcedTokens: (forcedTokens) => set({ forcedTokens }),
    }),
    {
      name: 'devtools-panel',
      partialize: (s) => ({ position: s.position }),
    },
  ),
)
