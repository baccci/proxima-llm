import { describe, expect, test } from 'bun:test'
import type { ModelDTO } from '@shared/schemas/model.schema'
import {
  deriveComposerReasoning,
  pickInitialEffort,
  pickThinkingPatch,
  reconcileComposer,
} from './composer-reasoning'

// Minimal ModelDTO stub: these helpers only read capabilities, so a partial capabilities
// object with safe defaults is enough (same pattern as openrouter.test.ts).
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

describe('deriveComposerReasoning', () => {
  const reasoning = model({ thinking: true, efforts: ['low', 'medium', 'high'] })

  test('reasoning off when the toggle is off', () => {
    expect(
      deriveComposerReasoning(reasoning, { thinking: false, webSearch: false, effort: null }),
    ).toEqual({ thinkingActive: false, effortActive: null })
  })

  test('a model that cannot reason stays off even with the toggle on', () => {
    expect(
      deriveComposerReasoning(model({ thinking: false }), {
        thinking: true,
        webSearch: false,
        effort: 'high',
      }),
    ).toEqual({ thinkingActive: false, effortActive: null })
  })

  test('a mandatory model is on with the toggle off, at its starting effort', () => {
    expect(
      deriveComposerReasoning(
        model({ thinking: true, reasoningMandatory: true, efforts: ['low', 'medium', 'high'] }),
        { thinking: false, webSearch: false, effort: null },
      ),
    ).toEqual({ thinkingActive: true, effortActive: 'medium' })
  })

  test('an explicit effort pick wins over the starting effort', () => {
    expect(
      deriveComposerReasoning(reasoning, { thinking: true, webSearch: false, effort: 'high' }),
    ).toEqual({ thinkingActive: true, effortActive: 'high' })
  })

  test('with no explicit pick, effort is the model starting effort', () => {
    expect(
      deriveComposerReasoning(reasoning, { thinking: true, webSearch: false, effort: null }),
    ).toEqual({ thinkingActive: true, effortActive: 'medium' })
  })

  test('a binary reasoning model is on with no effort', () => {
    expect(
      deriveComposerReasoning(model({ thinking: true, efforts: [] }), {
        thinking: true,
        webSearch: false,
        effort: null,
      }),
    ).toEqual({ thinkingActive: true, effortActive: null })
  })

  test('no model selected is fully off', () => {
    expect(
      deriveComposerReasoning(undefined, { thinking: true, webSearch: false, effort: 'high' }),
    ).toEqual({ thinkingActive: false, effortActive: null })
  })
})

describe('pickThinkingPatch', () => {
  test('enabling seeds the model starting effort', () => {
    expect(pickThinkingPatch(true, model({ efforts: ['low', 'medium', 'high'] }))).toEqual({
      thinking: true,
      effort: 'medium',
    })
  })

  test('enabling a binary reasoning model seeds no effort', () => {
    expect(pickThinkingPatch(true, model({ efforts: [] }))).toEqual({
      thinking: true,
      effort: null,
    })
  })

  test('disabling clears the effort', () => {
    expect(pickThinkingPatch(false, model({ efforts: ['low', 'medium', 'high'] }))).toEqual({
      thinking: false,
      effort: null,
    })
  })

  test('enabling with no model selected seeds no effort', () => {
    expect(pickThinkingPatch(true, undefined)).toEqual({ thinking: true, effort: null })
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
