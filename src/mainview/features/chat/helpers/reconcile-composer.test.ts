import { describe, expect, test } from 'bun:test'
import type { ModelDTO } from '@shared/schemas/model.schema'
import { pickInitialEffort, reconcileComposer } from './reconcile-composer'

// Minimal ModelDTO stub: reconcileComposer only reads capabilities, so a partial
// capabilities object with safe defaults is enough (same pattern as openrouter.test.ts).
function model(caps: Partial<ModelDTO['capabilities']> = {}): ModelDTO {
  return {
    capabilities: {
      thinking: false,
      reasoningMandatory: false,
      efforts: [],
      defaultEffort: null,
      webSearch: false,
      ...caps,
    },
  } as ModelDTO
}

describe('pickInitialEffort', () => {
  test('prefers the declared default effort', () => {
    expect(
      pickInitialEffort(model({ efforts: ['low', 'medium', 'high'], defaultEffort: 'high' })),
    ).toBe('high')
  })

  test('falls back to the middle level when there is no default', () => {
    expect(pickInitialEffort(model({ efforts: ['low', 'medium', 'high'] }))).toBe('medium')
  })

  test('is null for a model with no effort granularity', () => {
    expect(pickInitialEffort(model({ efforts: [] }))).toBeNull()
  })
})

describe('reconcileComposer', () => {
  test('forces thinking on and picks a starting effort for a mandatory model', () => {
    const patch = reconcileComposer(
      model({ thinking: true, reasoningMandatory: true, efforts: ['low', 'medium', 'high'] }),
      { thinking: false, webSearch: false, effort: null },
    )
    expect(patch.thinking).toBe(true)
    expect(patch.effort).toBe('medium')
  })

  test('turning thinking on resets an unavailable effort to the model default', () => {
    const patch = reconcileComposer(
      model({ thinking: true, efforts: ['low', 'medium', 'high'], defaultEffort: 'low' }),
      { thinking: true, webSearch: false, effort: 'max' },
    )
    expect(patch.effort).toBe('low')
  })

  test('a non-thinking model clears both thinking and effort', () => {
    const patch = reconcileComposer(model({ thinking: false }), {
      thinking: true,
      webSearch: false,
      effort: 'high',
    })
    expect(patch).toEqual({ thinking: false, effort: null })
  })

  test('thinking off clears a stale effort without touching thinking', () => {
    const patch = reconcileComposer(model({ thinking: true, efforts: ['low', 'medium', 'high'] }), {
      thinking: false,
      webSearch: false,
      effort: 'medium',
    })
    expect(patch.effort).toBeNull()
    expect(patch.thinking).toBeUndefined()
  })

  test('a valid, in-range effort is left untouched (empty patch)', () => {
    const patch = reconcileComposer(model({ thinking: true, efforts: ['low', 'medium', 'high'] }), {
      thinking: true,
      webSearch: false,
      effort: 'high',
    })
    expect(patch).toEqual({})
  })

  test('a binary mandatory model forces thinking but keeps effort null', () => {
    const patch = reconcileComposer(
      model({ thinking: true, reasoningMandatory: true, efforts: [] }),
      { thinking: false, webSearch: false, effort: null },
    )
    expect(patch.thinking).toBe(true)
    expect('effort' in patch).toBe(false)
  })

  test('drops web search the model cannot do', () => {
    const patch = reconcileComposer(model({ webSearch: false }), {
      thinking: false,
      webSearch: true,
      effort: null,
    })
    expect(patch.webSearch).toBe(false)
  })
})
