import type { MessageDTO } from '@shared/schemas/message.schema'

// Which stored messages a compaction run folds into the summary, plus the boundary
// markers it saves. Pure (no DB or model calls), so the slice math stays testable in
// isolation.
export type CompactionSelection = {
  toSummarize: MessageDTO[]
  // Last summarized message: the snapshot's coveredThrough boundary.
  boundary: MessageDTO
  // Chat tail at compaction time: the divider display anchor. Kept-full recent
  // messages sit between boundary and this, above the line.
  displayBoundary: MessageDTO
}

// Returns null when there is nothing older than the previous snapshot to summarize.
export function selectCompaction(
  all: MessageDTO[],
  prevCoveredThroughAt: string | undefined,
  keep: number,
): CompactionSelection | null {
  const since = prevCoveredThroughAt ? all.filter((m) => m.createdAt > prevCoveredThroughAt) : all
  // slice(0, -0) is slice(0, 0) = [], so keep<=0 (summarize everything) must copy explicitly.
  const toSummarize = keep > 0 ? since.slice(0, -keep) : since.slice()
  if (toSummarize.length === 0) {
    return null
  }

  return {
    toSummarize,
    boundary: toSummarize.at(-1)!,
    displayBoundary: since.at(-1)!,
  }
}
