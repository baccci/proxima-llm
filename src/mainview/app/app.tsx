import { QueryClientProvider } from '@tanstack/react-query'
import { IconPanelLeftClose } from '@/components/icons/icon-panel-left-close'
import { IconPanelLeftOpen } from '@/components/icons/icon-panel-left-open'
import { TooltipProvider, TooltipWrapper } from '@/components/tooltip'
import { useChatStore } from '@/features/chat/store/chat.store'
import { DevPanel } from '@/features/devtools/components/dev-panel'
import { queryClient } from '@/lib/query-client'
import { MainPane } from './layout/main-pane'
import { Sidebar } from './layout/sidebar'
import { useApplyTheme } from './use-apply-theme'
import { useWebkitTabFocus } from './use-webkit-tab-focus'

function AppShell() {
  useApplyTheme()
  useWebkitTabFocus()
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const toggleSidebar = useChatStore((s) => s.toggleSidebar)

  return (
    <div className="flex h-full p-2 gap-2 bg-background text-foreground font-sans">
      {/* Full-width drag handle at the top — Electrobun detects .electrobun-webkit-app-region-drag via mousedown */}
      <div
        className="fixed top-0 inset-x-0 h-14 electrobun-webkit-app-region-drag"
        aria-hidden="true"
      />

      {sidebarOpen && <Sidebar />}

      <TooltipWrapper content={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'} side="bottom">
        <button
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Open sidebar'}
          className="fixed top-3 left-24 z-sticky flex items-center justify-center p-1 rounded-lg text-muted hover:bg-surface-hover hover:text-foreground transition-colors cursor-pointer electrobun-webkit-app-region-no-drag"
        >
          {sidebarOpen ? <IconPanelLeftClose width={16} /> : <IconPanelLeftOpen width={16} />}
        </button>
      </TooltipWrapper>

      <MainPane />

      {import.meta.env.VITE_TWEAK === '1' && <DevPanel />}
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
