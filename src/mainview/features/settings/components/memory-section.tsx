import { MemoryScope } from '@shared/schemas/memory-slice.schema'
import { MemorySliceList } from '@/features/projects/components/memory-slice-list'

export function MemorySection() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-subtle">
        Global memory is available across every chat. Add notes, preferences, or context the model
        should always be able to access.
      </p>
      <MemorySliceList scope={MemoryScope.enum.global} projectId={null} />
    </div>
  )
}
