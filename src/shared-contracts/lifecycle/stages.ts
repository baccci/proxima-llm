// The named points in a chat turn's lifecycle. A stable name for each observable stage lets
// the post-response steps be tagged uniformly and lets hooks attach to a stage by name.
// Shaped like STREAM_CHUNK_KIND: an `as const` object plus a union derived from it.
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
} as const

export type LifecycleStage = (typeof LIFECYCLE_STAGE)[keyof typeof LIFECYCLE_STAGE]
