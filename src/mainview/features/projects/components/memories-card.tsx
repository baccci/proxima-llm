import { DialogContent, DialogRoot, DialogTrigger } from '@/components/dialog'
import { IconBrain } from '@/components/icons/icon-brain'
import { useMemorySlices } from '../hooks/use-memory-slices'
import { useMemorySummary } from '../hooks/use-memory-summary'
import { MemorySliceList } from './memory-slice-list'

interface Props {
  projectId: string
}

export function MemoriesCard({ projectId }: Props) {
  const { data: slices = [] } = useMemorySlices('project', projectId)
  const { data } = useMemorySummary(projectId)
  const summary = data?.summary ?? null
  const hasMemories = slices.length > 0

  return (
    <DialogRoot>
      <DialogTrigger
        nativeButton={false}
        className="w-full text-left rounded-xl border border-border bg-panel p-4 flex flex-col gap-3 hover:bg-surface-hover transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
        render={<div />}
      >
        <div className="flex items-center gap-2">
          <IconBrain width={16} className="text-subtle" />
          <span className="text-sm font-medium text-foreground">Memories</span>
        </div>
        {!hasMemories ? (
          <p className="text-xs text-subtle italic">No memories yet. Click to add.</p>
        ) : summary ? (
          <p className="text-xs text-muted line-clamp-3 leading-relaxed">{summary}</p>
        ) : (
          <p className="text-xs text-subtle italic">
            {slices.length} {slices.length === 1 ? 'memory' : 'memories'} saved. Open to view.
          </p>
        )}
      </DialogTrigger>
      <DialogContent title="Memories" wide>
        <div className="max-h-[60vh] overflow-y-auto">
          <MemorySliceList scope="project" projectId={projectId} />
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
