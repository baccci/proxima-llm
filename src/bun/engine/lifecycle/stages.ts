// The named points in a chat turn's lifecycle: the vocabulary pillar A introduces.
// A stable name for each observable stage lets the post-response LLM steps be tagged
// uniformly today, and lets user-defined hooks attach to a stage by name later
// (pillar C). Only the three resilient steps (compaction, autoTitle, memorySummary)
// carry machinery; the rest are named reference points for the hook system to attach to.
//
// Shaped like STREAM_CHUNK_KIND: an `as const` object plus a union derived from it,
// so a stage is a checked literal and renames are compiler-guided.
export const LIFECYCLE_STAGE = {
  turnTriggered: 'turn-triggered',
  userPersisted: 'user-persisted',
  preflight: 'preflight',
  streamRegistered: 'stream-registered',
  contextGathered: 'context-gathered',
  compaction: 'compaction',
  promptBuilt: 'prompt-built',
  modelStreaming: 'model-streaming',
  streamFinished: 'stream-finished',
  assistantSaved: 'assistant-saved',
  turnDone: 'turn-done',
  autoTitle: 'auto-title',
  memorySummary: 'memory-summary',
  turnError: 'turn-error',
} as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGE)[keyof typeof LIFECYCLE_STAGE];
