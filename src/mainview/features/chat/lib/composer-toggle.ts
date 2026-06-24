import { cn } from '@utils/tailwind-class-merge'

const TOGGLE_BASE =
  'flex items-center justify-center h-8 w-8 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none'

export function composerToggleClass(active: boolean): string {
  return cn(
    TOGGLE_BASE,
    active
      ? 'bg-white/10 text-white'
      : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white',
  )
}
