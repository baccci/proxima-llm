import { ModelSource } from '../../infra/db/model-source'

// The catalog fields the reconcile decision needs. A trimmed view of a model row so
// the planner stays pure and testable without a database.
export type ReconcilableRow = {
  id: string
  source: ModelSource
  isEnabled: boolean
}

// What to do with rows the latest OpenRouter catalog no longer lists.
export type MissingModelPlan = {
  toDelete: string[]
  toDisable: string[]
}

// Decide what happens to catalog rows after a sync. keepIds is the set of model ids the
// latest OpenRouter catalog still lists. Only openrouter-sourced rows are reconciled;
// builtin (seed) rows are never touched here. A row missing from keepIds is a model that
// no longer exists upstream (its endpoints are gone). If the user had it disabled it is
// deleted to declutter the marketplace; if the user had it enabled it is only disabled,
// so we never silently delete the user's choice, and the title picker / marketplace stop
// treating a dead model as usable. An empty keep-set means the fetch yielded nothing, so
// the plan is empty: a failed sync must not wipe or disable the table.
export function planMissingModels(rows: ReconcilableRow[], keepIds: string[]): MissingModelPlan {
  if (keepIds.length === 0) {
    return { toDelete: [], toDisable: [] }
  }

  const keep = new Set(keepIds)
  const plan: MissingModelPlan = { toDelete: [], toDisable: [] }

  for (const r of rows) {
    if (r.source !== ModelSource.enum.openrouter || keep.has(r.id)) {
      continue
    }

    if (r.isEnabled) {
      plan.toDisable.push(r.id)
    } else {
      plan.toDelete.push(r.id)
    }
  }

  return plan
}
