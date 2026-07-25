import { MemoryScope } from '@shared/schemas/memory-slice.schema'
import { DialogContent, DialogRoot, DialogTrigger } from '@/components/dialog'
import { IconBrain } from '@/components/icons/icon-brain'
import { MemorySliceList } from '@/features/memory/components/memory-slice-list'
import { useMemorySlices } from '@/features/memory/hooks/use-memory-slices'
import { useMemorySummary } from '../hooks/use-memory-summary'

type MemoriesCardProps = {
  projectId: string
}

type MemoriesPreviewProps = {
  hasMemories: boolean
  summary: string | null
  sliceCount: number
}

function MemoriesPreview({ hasMemories, summary, sliceCount }: MemoriesPreviewProps) {
  if (!hasMemories) {
    return <p className="text-xs text-subtle italic">No memories yet. Click to add.</p>
  }

  if (summary) {
    return <p className="text-xs text-muted line-clamp-3 leading-relaxed">{summary}</p>
  }

  return (
    <p className="text-xs text-subtle italic">
      {sliceCount} {sliceCount === 1 ? 'memory' : 'memories'} saved. Open to view.
    </p>
  )
}

export function MemoriesCard({ projectId }: MemoriesCardProps) {
  const { data: slices = [] } = useMemorySlices(MemoryScope.enum.project, projectId)
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
        <MemoriesPreview hasMemories={hasMemories} summary={summary} sliceCount={slices.length} />
      </DialogTrigger>
      <DialogContent title="Memories" wide>
        <div className="max-h-[60vh] overflow-y-auto">
          <MemorySliceList scope={MemoryScope.enum.project} projectId={projectId} />
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
