import { ACTION_TIER, type ActionTier } from './action-tier'
import { HOOK_PROVENANCE, type HookProvenance } from './provenance'
import { LIFECYCLE_STAGE, type LifecycleStage } from './stages'

// Stable ids for the shipped actions. A config entry and the executable catalog both reference
// an action by one of these.
export const HOOK_ACTION_ID = {
  compaction: 'builtin.compaction',
  autoTitle: 'builtin.auto-title',
  memorySummary: 'builtin.memory-summary',
  completionSound: 'builtin.completion-sound',
  completionNotification: 'builtin.completion-notification',
  errorSound: 'builtin.error-sound',
} as const

export type HookActionId = (typeof HOOK_ACTION_ID)[keyof typeof HOOK_ACTION_ID]

// The renderer-visible metadata for one catalog action. The executable `run` lives Bun-side in
// engine/lifecycle/catalog.ts; this is everything the config surface and trust model need.
// `userManageable` is false for the three core mechanics (compaction/auto-title/memory-summary):
// they are always on, never shown in the settings UI, and not togglable via setHook.
export type HookCatalogEntry = {
  actionId: HookActionId
  stage: LifecycleStage
  tier: ActionTier
  label: string
  description: string
  provenance: HookProvenance
  defaultEnabled: boolean
  userManageable: boolean
}

// One declarative hook: bind a stage to a catalog action, plus the flags the registry, a later
// editor, and the trust model need. `params` is reserved (no v1 action reads it); when an action
// starts reading it, it must be safe under any attacker-chosen value.
export type HookConfigEntry = {
  stage: LifecycleStage
  actionId: string
  enabled: boolean
  provenance: HookProvenance
  params?: Record<string, unknown>
}

// A row the settings surface renders: catalog metadata joined with the effective enabled bit.
export type HookDetailRow = {
  stage: LifecycleStage
  actionId: string
  label: string
  description: string
  tier: ActionTier
  provenance: HookProvenance
  enabled: boolean
}

export const HOOK_CATALOG: readonly HookCatalogEntry[] = [
  {
    actionId: HOOK_ACTION_ID.compaction,
    stage: LIFECYCLE_STAGE.compaction,
    tier: ACTION_TIER.act,
    label: 'Compaction',
    description: 'Summarizes older messages when a chat grows past the context threshold.',
    provenance: HOOK_PROVENANCE.builtIn,
    defaultEnabled: true,
    userManageable: false,
  },
  {
    actionId: HOOK_ACTION_ID.autoTitle,
    stage: LIFECYCLE_STAGE.autoTitle,
    tier: ACTION_TIER.act,
    label: 'Auto-title',
    description: 'Names a new chat from its first exchange.',
    provenance: HOOK_PROVENANCE.builtIn,
    defaultEnabled: true,
    userManageable: false,
  },
  {
    actionId: HOOK_ACTION_ID.memorySummary,
    stage: LIFECYCLE_STAGE.memorySummary,
    tier: ACTION_TIER.act,
    label: 'Memory summary',
    description: 'Regenerates a project memory summary after a memory change.',
    provenance: HOOK_PROVENANCE.builtIn,
    defaultEnabled: true,
    userManageable: false,
  },
  {
    actionId: HOOK_ACTION_ID.completionSound,
    stage: LIFECYCLE_STAGE.turnDone,
    tier: ACTION_TIER.observe,
    label: 'Completion sound',
    description: 'Play a sound when a reply finishes.',
    provenance: HOOK_PROVENANCE.builtIn,
    defaultEnabled: false,
    userManageable: true,
  },
  {
    actionId: HOOK_ACTION_ID.completionNotification,
    stage: LIFECYCLE_STAGE.turnDone,
    tier: ACTION_TIER.observe,
    label: 'Completion notification',
    description:
      'Show a desktop notification when a reply finishes and Proxima is in the background.',
    provenance: HOOK_PROVENANCE.builtIn,
    defaultEnabled: false,
    userManageable: true,
  },
  {
    actionId: HOOK_ACTION_ID.errorSound,
    stage: LIFECYCLE_STAGE.turnError,
    tier: ACTION_TIER.observe,
    label: 'Error sound',
    description: 'Play a distinct sound when a turn fails.',
    provenance: HOOK_PROVENANCE.builtIn,
    defaultEnabled: false,
    userManageable: true,
  },
]

export const HOOK_META: Map<string, HookCatalogEntry> = new Map(
  HOOK_CATALOG.map((h) => [h.actionId, h]),
)

// The registry seed. Derived from the catalog so a new built-in appears automatically with its
// default, and only the on/off bit can ever be stored — stage/tier/provenance stay catalog-fresh.
export const DEFAULT_HOOK_CONFIG: HookConfigEntry[] = HOOK_CATALOG.map((h) => ({
  stage: h.stage,
  actionId: h.actionId,
  enabled: h.defaultEnabled,
  provenance: h.provenance,
}))
