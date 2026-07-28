import { describe, expect, test } from 'bun:test'
import { ModelSource } from '../../infra/db/model-source'
import { planMissingModels, type ReconcilableRow } from './reconcile-missing-models'

function row(over: Partial<ReconcilableRow> = {}): ReconcilableRow {
  return {
    id: 'openrouter/m1',
    source: ModelSource.enum.openrouter,
    isEnabled: true,
    ...over,
  }
}

describe('planMissingModels', () => {
  test('an enabled model dropped from its catalog is disabled, not deleted', () => {
    const rows = [row({ id: 'gone', isEnabled: true })]
    const plan = planMissingModels(rows, ['still-here'], ModelSource.enum.openrouter)
    expect(plan.toDisable).toEqual(['gone'])
    expect(plan.toDelete).toEqual([])
  })

  test('a disabled model dropped from its catalog is deleted, not disabled', () => {
    const rows = [row({ id: 'gone', isEnabled: false })]
    const plan = planMissingModels(rows, ['still-here'], ModelSource.enum.openrouter)
    expect(plan.toDelete).toEqual(['gone'])
    expect(plan.toDisable).toEqual([])
  })

  test('a model still in the catalog is left untouched whether enabled or not', () => {
    const rows = [
      row({ id: 'keep-on', isEnabled: true }),
      row({ id: 'keep-off', isEnabled: false }),
    ]
    const plan = planMissingModels(rows, ['keep-on', 'keep-off'], ModelSource.enum.openrouter)
    expect(plan.toDelete).toEqual([])
    expect(plan.toDisable).toEqual([])
  })

  test('builtin models are never reconciled, even when missing from the catalog', () => {
    const rows = [
      row({ id: 'builtin-gone', source: ModelSource.enum.builtin, isEnabled: true }),
      row({ id: 'builtin-off', source: ModelSource.enum.builtin, isEnabled: false }),
    ]
    const plan = planMissingModels(rows, ['unrelated'], ModelSource.enum.openrouter)
    expect(plan.toDelete).toEqual([])
    expect(plan.toDisable).toEqual([])
  })

  test('an empty keep-set is a no-op: a failed fetch must not wipe or disable the table', () => {
    const rows = [row({ id: 'a', isEnabled: true }), row({ id: 'b', isEnabled: false })]
    const plan = planMissingModels(rows, [], ModelSource.enum.openrouter)
    expect(plan.toDelete).toEqual([])
    expect(plan.toDisable).toEqual([])
  })

  test('reconciling one source never touches another source, even when its ids are absent', () => {
    const rows = [
      row({ id: 'or-gone', source: ModelSource.enum.openrouter, isEnabled: true }),
      row({ id: 'an-gone', source: ModelSource.enum.anthropic, isEnabled: true }),
    ]

    // The OpenRouter keep-set (only OpenRouter ids) must not disable the Anthropic row.
    const orPlan = planMissingModels(rows, ['or-keep'], ModelSource.enum.openrouter)
    expect(orPlan.toDisable).toEqual(['or-gone'])

    // And the Anthropic keep-set (only Anthropic ids) must not disable the OpenRouter row.
    const anPlan = planMissingModels(rows, ['an-keep'], ModelSource.enum.anthropic)
    expect(anPlan.toDisable).toEqual(['an-gone'])
  })
})
