import type { DispatchStage } from './action';
import { BUILTIN_ACTION_ID } from './catalog';
import { LIFECYCLE_STAGE } from './stages';

// Where a hook entry came from. Shapes the trust model: only `user` (direct local human
// authorship) may later mint a raw-command hook; `agent` and `imported` are catalog-only.
// v1 seeds only `builtIn`. Enforcement lives in the future write surface, not here.
export const HOOK_PROVENANCE = {
  builtIn: 'built-in',
  user: 'user',
  agent: 'agent',
  imported: 'imported',
} as const;
export type HookProvenance = (typeof HOOK_PROVENANCE)[keyof typeof HOOK_PROVENANCE];

// One declarative hook: bind a stage to a catalog action, plus the flags a later editor and
// the trust model need. params is reserved for parameterized actions (none in v1); when an
// action starts reading params it must be safe under any attacker-chosen value (the trust
// model's load-bearing constraint), since agent/imported configs may set it.
export type HookConfigEntry = {
  stage: DispatchStage;
  actionId: string;
  enabled: boolean;
  provenance: HookProvenance;
  params?: Record<string, unknown>;
};

// The built-in defaults: the three post-response steps, each enabled and built-in. This is
// the seed the registry is built from and the shape a user config surface will later edit
// and persist.
export const DEFAULT_HOOK_CONFIG: HookConfigEntry[] = [
  {
    stage: LIFECYCLE_STAGE.compaction,
    actionId: BUILTIN_ACTION_ID.compaction,
    enabled: true,
    provenance: HOOK_PROVENANCE.builtIn,
  },
  {
    stage: LIFECYCLE_STAGE.autoTitle,
    actionId: BUILTIN_ACTION_ID.autoTitle,
    enabled: true,
    provenance: HOOK_PROVENANCE.builtIn,
  },
  {
    stage: LIFECYCLE_STAGE.memorySummary,
    actionId: BUILTIN_ACTION_ID.memorySummary,
    enabled: true,
    provenance: HOOK_PROVENANCE.builtIn,
  },
];
