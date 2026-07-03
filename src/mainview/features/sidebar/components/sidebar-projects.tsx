import type { ProjectDTO } from '@shared/schemas/project.schema'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/button'
import { CollapsiblePanel, CollapsibleRoot, CollapsibleTrigger } from '@/components/collapsible'
import { DialogContent, DialogRoot } from '@/components/dialog'
import { IconChevronRight } from '@/components/icons/icon-chevron-right'
import { IconPlus } from '@/components/icons/icon-plus'
import { Input } from '@/components/input'
import { resolveIconColor } from '@/entities/project/icon'
import { resolvePalette } from '@/entities/project/palette'
import { useChatStore } from '@/features/chat/store/chat.store'
import { ProjectAppearancePicker } from '@/features/projects/components/project-appearance-picker'
import { useProjects } from '@/features/projects/hooks/use-projects'
import { getProjectIcon } from '@/features/projects/lib/project-icon'
import { useIsDark } from '@/features/projects/lib/use-is-dark'
import { projects as projectsApi } from '@/features/projects/projects.api'
import { useSidebarStore } from '@/features/sidebar/store/sidebar.store'

interface CreateProjectFields {
  name: string
  description: string
}

function CreateProjectDialog() {
  const [open, setOpen] = React.useState(false)
  const [icon, setIcon] = React.useState<string | null>(null)
  const [palette, setPalette] = React.useState<string | null>(null)
  const [iconColor, setIconColor] = React.useState<string | null>(null)
  const selectProject = useChatStore((s) => s.selectProject)

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateProjectFields>({ defaultValues: { name: '', description: '' } })

  async function onSubmit(data: CreateProjectFields) {
    const created = await projectsApi.create({
      name: data.name,
      description: data.description || undefined,
      icon: icon ?? undefined,
      palette: palette ?? undefined,
      iconColor: iconColor ?? undefined,
    })
    selectProject(created.id)
    reset()
    setIcon(null)
    setPalette(null)
    setIconColor(null)
    setOpen(false)
  }

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
        <IconPlus width={14} />
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent title="New project" description="Give your project a name and purpose.">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Name</label>
              <Input
                placeholder="e.g. Marketing site"
                autoFocus
                {...register('name', { required: true })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Purpose</label>
              <Input
                placeholder="What will you use this project for? (optional)"
                {...register('description')}
              />
            </div>
            <ProjectAppearancePicker
              icon={icon}
              palette={palette}
              iconColor={iconColor}
              onIconChange={setIcon}
              onPaletteChange={setPalette}
              onIconColorChange={setIconColor}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  reset()
                  setIcon(null)
                  setPalette(null)
                  setIconColor(null)
                  setOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={isSubmitting}>
                Create project
              </Button>
            </div>
          </form>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

function ProjectPill({ project }: { project: ProjectDTO }) {
  const selectProject = useChatStore((s) => s.selectProject)
  const isDark = useIsDark()
  const colors = resolvePalette(project.palette, isDark)
  const iconColor = resolveIconColor(project.iconColor, colors)
  const Icon = getProjectIcon(project.icon)

  return (
    <li>
      <button
        onClick={() => selectProject(project.id)}
        style={colors ? { backgroundColor: colors.bg, color: colors.fr } : undefined}
        className={cn(
          'flex items-center gap-2 w-full px-2 h-8 text-sm rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          colors ? 'font-medium' : 'text-muted hover:bg-surface-hover hover:text-foreground',
        )}
      >
        <Icon
          width={15}
          style={iconColor ? { color: iconColor } : undefined}
          className={cn('shrink-0', !iconColor && 'text-subtle')}
        />
        <span className="flex-1 text-left min-w-0 truncate font-medium leading-tight">
          {project.name}
        </span>
      </button>
    </li>
  )
}

export function SidebarProjects() {
  const { data: projectList = [] } = useProjects()
  const { projectsCollapsed, toggleProjects } = useSidebarStore()

  return (
    <CollapsibleRoot open={!projectsCollapsed} onOpenChange={() => toggleProjects()}>
      <div className="flex items-center justify-between px-4 py-2">
        <CollapsibleTrigger className="flex items-center gap-1.5 text-2xs font-semibold text-subtle uppercase tracking-wider hover:text-muted transition-colors">
          <IconChevronRight
            width={12}
            className={cn('transition-transform duration-200', !projectsCollapsed && 'rotate-90')}
          />
          Projects
        </CollapsibleTrigger>
        <CreateProjectDialog />
      </div>

      <CollapsiblePanel>
        {projectList.length === 0 ? (
          <p className="px-4 pb-2 text-xs text-subtle italic">No projects yet</p>
        ) : (
          <ul className="px-2 pb-1 flex flex-col gap-0.5">
            {projectList.map((project) => (
              <ProjectPill key={project.id} project={project} />
            ))}
          </ul>
        )}
      </CollapsiblePanel>
    </CollapsibleRoot>
  )
}
