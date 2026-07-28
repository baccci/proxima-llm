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
  test('an enabled openrouter model dropped from the catalog is disabled, not deleted', () => {
    const rows = [row({ id: 'gone', isEnabled: true })]
    const plan = planMissingModels(rows, ['still-here'])
    expect(plan.toDisable).toEqual(['gone'])
    expect(plan.toDelete).toEqual([])
  })

  test('a disabled openrouter model dropped from the catalog is deleted, not disabled', () => {
    const rows = [row({ id: 'gone', isEnabled: false })]
    const plan = planMissingModels(rows, ['still-here'])
    expect(plan.toDelete).toEqual(['gone'])
    expect(plan.toDisable).toEqual([])
  })

  test('a model still in the catalog is left untouched whether enabled or not', () => {
    const rows = [
      row({ id: 'keep-on', isEnabled: true }),
      row({ id: 'keep-off', isEnabled: false }),
    ]
    const plan = planMissingModels(rows, ['keep-on', 'keep-off'])
    expect(plan.toDelete).toEqual([])
    expect(plan.toDisable).toEqual([])
  })

  test('builtin models are never reconciled, even when missing from the catalog', () => {
    const rows = [
      row({ id: 'builtin-gone', source: ModelSource.enum.builtin, isEnabled: true }),
      row({ id: 'builtin-off', source: ModelSource.enum.builtin, isEnabled: false }),
    ]
    const plan = planMissingModels(rows, ['unrelated'])
    expect(plan.toDelete).toEqual([])
    expect(plan.toDisable).toEqual([])
  })

  test('an empty keep-set is a no-op: a failed fetch must not wipe or disable the table', () => {
    const rows = [row({ id: 'a', isEnabled: true }), row({ id: 'b', isEnabled: false })]
    const plan = planMissingModels(rows, [])
    expect(plan.toDelete).toEqual([])
    expect(plan.toDisable).toEqual([])
  })
})
