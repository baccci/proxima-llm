import { log } from '../../infra/logging/logger'
import type { ActionRegistry, AnyAction, DispatchStage, StageContextMap } from './action'
import { CATALOG } from './catalog'
import { DEFAULT_HOOK_CONFIG, type HookConfigEntry } from './hook-config'
import { LIFECYCLE_STAGE } from './stages'

// Run a stage's actions in order with per-action error isolation: a thrown action is logged
// and the next still runs, so one failing action never sinks the others or the turn. Awaited
// sequentially so an Act action that writes state (a compaction snapshot) has finished before
// the caller reads it. Non-fatal by contract: this resolves even when every action throws.
export async function runActions(actions: AnyAction[], ctx: unknown, stage: string): Promise<void> {
  for (const action of actions) {
    try {
      await action.run(ctx)
    } catch (err) {
      log.error(`Lifecycle action '${action.id}' failed on stage '${stage}' (non-fatal)`, err)
    }
  }
}

// Build the dispatch registry from a declarative config and the action catalog. Walks the
// config in order; skips a disabled entry, and skips an entry whose actionId is not in the
// catalog (a config from a file or a future agent can name an action this build does not
// ship). Each kept action lands in its own stage's bucket, preserving config order.
export function buildRegistry(
  config: HookConfigEntry[],
  catalog: Map<string, AnyAction>,
): ActionRegistry {
  const registry: ActionRegistry = {
    [LIFECYCLE_STAGE.compaction]: [],
    [LIFECYCLE_STAGE.autoTitle]: [],
    [LIFECYCLE_STAGE.memorySummary]: [],
    [LIFECYCLE_STAGE.turnDone]: [],
    [LIFECYCLE_STAGE.turnError]: [],
    [LIFECYCLE_STAGE.approvalNeeded]: [],
  }
  for (const entry of config) {
    if (!entry.enabled) {
      continue
    }
    const action = catalog.get(entry.actionId)
    if (!action) {
      log.warn(
        `Hook config names unknown action '${entry.actionId}' on stage '${entry.stage}', skipping`,
      )
      continue
    }
    registry[action.stage].push(action)
  }
  return registry
}

// The process-wide registry. Seeded from the built-in defaults so pre-boot dispatch is safe;
// rebuilt from the persisted config once the DB is ready and after every setHook write.
let registry = buildRegistry(DEFAULT_HOOK_CONFIG, CATALOG)

// Rebuild the process registry from a fresh config. The DB is kept out of this module's import
// graph: the caller (boot, the setHook handler) loads the config and passes it in.
export function rebuildRegistry(config: HookConfigEntry[]): void {
  registry = buildRegistry(config, CATALOG)
}

// Fire every enabled action bound to a stage, with the stage's typed context. The stage key
// is constrained to the wired stages, so a non-dispatch stage cannot be passed. Resolves once
// all actions have settled (Act steps awaited); never throws.
export function dispatchStage<S extends DispatchStage>(
  stage: S,
  ctx: StageContextMap[S],
): Promise<void> {
  return runActions(registry[stage], ctx, stage)
}
