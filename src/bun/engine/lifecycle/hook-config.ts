// The declarative hook config shape and its catalog-derived seed now live in shared-contracts
// (the renderer consumes them via the config surface). This re-export keeps the bun import path
// (`./hook-config`) stable for dispatch and the repository.
export {
  DEFAULT_HOOK_CONFIG,
  type HookConfigEntry,
} from '../../../shared-contracts/lifecycle/hook-catalog'
export {
  HOOK_PROVENANCE,
  type HookProvenance,
} from '../../../shared-contracts/lifecycle/provenance'
