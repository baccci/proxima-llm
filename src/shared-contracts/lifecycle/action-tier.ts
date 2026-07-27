// The power tier a catalog action declares. Observe: told a stage happened, does a side effect
// (sound, notification, log). Act: writes state a later stage reads (a title, a compaction
// snapshot, a memory slice). Neither tier mutates the in-flight prompt or vetoes the turn.
export const ACTION_TIER = {
  observe: 'observe',
  act: 'act',
} as const

export type ActionTier = (typeof ACTION_TIER)[keyof typeof ACTION_TIER]
