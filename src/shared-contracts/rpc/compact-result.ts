// Result of a context-compaction pass. bun's compaction service returns it and the
// renderer receives it through the compactNow RPC. Named vocab so the status and the
// no-op reason read as labels, not bare strings; the type derives from these objects.
export const COMPACT_STATUS = {
  ok: 'ok',
  noop: 'noop',
} as const

export const COMPACT_NOOP_REASON = {
  nothingToSummarize: 'nothing-to-summarize',
  emptySummary: 'empty-summary',
} as const

type CompactNoopReason = (typeof COMPACT_NOOP_REASON)[keyof typeof COMPACT_NOOP_REASON]

export type CompactResult =
  | { status: typeof COMPACT_STATUS.ok; summarized: number }
  | { status: typeof COMPACT_STATUS.noop; reason: CompactNoopReason }
