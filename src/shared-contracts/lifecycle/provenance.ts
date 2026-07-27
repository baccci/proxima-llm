// Where a hook entry came from. Shapes the trust model: only `user` (direct local human
// authorship) may later mint a raw-command hook; `agent` and `imported` are catalog-only.
// v1 seeds only `builtIn`. Enforcement lives in the future write surface, not here.
export const HOOK_PROVENANCE = {
  builtIn: 'built-in',
  user: 'user',
  agent: 'agent',
  imported: 'imported',
} as const

export type HookProvenance = (typeof HOOK_PROVENANCE)[keyof typeof HOOK_PROVENANCE]
