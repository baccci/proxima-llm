import type { ProjectDTO } from '@shared/schemas/project.schema'
import { cn } from '@utils/tailwind-class-merge'
import React from 'react'
import { Button } from '@/components/button'
import { DialogContent, DialogRoot } from '@/components/dialog'
import { IconPencil } from '@/components/icons/icon-pencil'
import { Input } from '@/components/input'
import { ComposerBody } from '@/features/chat/components/composer-body'
import { useChats } from '@/features/chat/hooks/use-chats'
import { useChatStore } from '@/features/chat/store/chat.store'
import { useProjects } from '@/features/projects/hooks/use-projects'
import { projects as projectsApi } from '@/features/projects/projects.api'
import { FilesCard } from './files-card'
import { MemoriesCard } from './memories-card'
import { ProjectAppearancePicker } from './project-appearance-picker'

type ProjectViewProps = {
  projectId: string
}

function EditAppearanceButton({ project }: { project: ProjectDTO }) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(project.name)
  const [description, setDescription] = React.useState(project.description ?? '')
  const [icon, setIcon] = React.useState<string | null>(project.icon)
  const [palette, setPalette] = React.useState<string | null>(project.palette)
  const [iconColor, setIconColor] = React.useState<string | null>(project.iconColor)

  function openDialog() {
    setName(project.name)
    setDescription(project.description ?? '')
    setIcon(project.icon)
    setPalette(project.palette)
    setIconColor(project.iconColor)
    setOpen(true)
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    await projectsApi.update({
      id: project.id,
      name: trimmed,
      description: description.trim() || undefined,
      icon,
      palette,
      iconColor,
    })
    setOpen(false)
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={openDialog}
        className="shrink-0 electrobun-webkit-app-region-no-drag"
      >
        <IconPencil width={14} />
      </Button>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Edit project"
          description="Update this project's details and appearance."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted">Purpose</label>
              <Input
                placeholder="What will you use this project for? (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="brand" onClick={save}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>
    </>
  )
}

export function ProjectView({ projectId }: ProjectViewProps) {
  const { data: projects = [] } = useProjects()
  const { data: chats = [] } = useChats(projectId)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const selectChat = useChatStore((s) => s.selectChat)

  const project = projects.find((p) => p.id === projectId)

  if (!project) return null

  return (
    <main className="flex flex-col flex-1 h-full overflow-hidden z-base">
      {/* Drag bar */}
      <div
        className={cn(
          'flex items-center h-[50px] shrink-0 electrobun-webkit-app-region-drag',
          sidebarOpen ? 'px-6' : 'pl-(--layout-header-inset) pr-6',
        )}
      >
        <span className="text-sm font-semibold text-foreground truncate electrobun-webkit-app-region-no-drag">
          {project.name}
        </span>
      </div>

      {/* Content */}
      <div className="overflow-hidden overflow-y-auto w-full ">
        <div className="flex flex-col flex-1 max-w-160 w-full mx-auto px-6">
          {/* Hero + Composer */}
          <div className="shrink-0 pt-8 pb-6 flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                  {project.name}
                </h1>
                <EditAppearanceButton project={project} />
              </div>
              {project.description && (
                <p className="mt-1.5 text-sm text-muted leading-relaxed">{project.description}</p>
              )}
            </div>
            <ComposerBody projectId={projectId} />
          </div>

          {/* Chats — scrollable middle */}
          <div className="flex flex-col flex-1 min-h-40 overflow-hidden">
            {chats.length > 0 && (
              <section className="flex flex-col h-full overflow-hidden gap-2">
                <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider shrink-0">
                  Chats
                </h2>
                <ul className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
                  {chats.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => selectChat(c.id)}
                        className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-panel hover:bg-surface-hover transition-colors text-sm text-foreground truncate"
                      >
                        {c.title || 'Untitled chat'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Cards — pinned bottom, stacked */}
          <div className="shrink-0 flex flex-col gap-4 py-6">
            <MemoriesCard projectId={projectId} />
            <FilesCard projectId={projectId} />
          </div>
        </div>
      </div>
    </main>
  )
}
