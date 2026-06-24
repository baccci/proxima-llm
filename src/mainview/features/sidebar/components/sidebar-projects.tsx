import { cn } from '@utils/tailwind-class-merge'
import { Button } from '@/components/button'
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from '@/components/collapsible'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { IconFolderOpen } from '@/components/icons/icon-folder-open'
import { IconPlus } from '@/components/icons/icon-plus'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useProjects } from '@/features/projects/hooks/use-projects'
import { useSidebarStore } from '@/features/sidebar/store/sidebar.store'

export function SidebarProjects() {
  const { data: projects = [] } = useProjects()
  const selectChat = useChatStore((s) => s.selectChat)
  const { projectsCollapsed, toggleProjects } = useSidebarStore()

  function handleProjectClick(_projectId: string) {
    // selecting a project clears active chat — sidebar chat list will filter to it
    selectChat(null)
    // future: set selected project id in a projects store slice
  }

  return (
    <CollapsibleRoot open={!projectsCollapsed} onOpenChange={() => toggleProjects()}>
      <div className="flex items-center justify-between px-3 py-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-2xs font-semibold text-subtle uppercase tracking-wider hover:text-muted transition-colors">
          <IconChevronRight
            width={12}
            className={cn('transition-transform duration-200', !projectsCollapsed && 'rotate-90')}
          />
          Projects
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            /* TODO: open create project dialog */
          }}
        >
          <IconPlus width={14} />
        </Button>
      </div>

      <CollapsiblePanel>
        {projects.length === 0 ? (
          <p className="px-4 pb-2 text-xs text-subtle italic">No projects yet</p>
        ) : (
          <ul className="pb-1">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  onClick={() => handleProjectClick(project.id)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-muted hover:bg-surface-hover hover:text-foreground rounded-lg mx-1 transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center shrink-0 border border-border">
                    <IconFolderOpen width={14} className="text-subtle" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="truncate font-medium text-sm leading-tight">{project.name}</div>
                    <div className="text-2xs text-subtle mt-0.5">{project.description ?? ''}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CollapsiblePanel>
    </CollapsibleRoot>
  )
}
