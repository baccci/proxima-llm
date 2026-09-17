import { describe, expect, test } from 'bun:test'
import { ProviderId } from '@shared/providers/registry'
import type { ModelDTO } from '@shared/schemas/model.schema'
import type { ProviderTitleConfig } from '@shared/schemas/settings.schema'
import { selectTitleModel } from './select-title-model'

function model(over: Partial<ModelDTO> = {}): ModelDTO {
  return {
    id: 'anthropic/m1',
    provider: ProviderId.enum.anthropic,
    family: 'sonnet',
    displayName: 'M1',
    capabilities: {
      thinking: false,
      reasoningMandatory: false,
      efforts: [],
      defaultEffort: null,
      vision: false,
      pdf: false,
      tools: false,
      promptCaching: false,
      webSearch: false,
      maxOutputTokens: 8192,
    },
    isEnabled: true,
    pricing: { prompt: 1, completion: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const custom = (modelId: string | null): ProviderTitleConfig => ({ mode: 'custom', modelId })
const auto: ProviderTitleConfig = { mode: 'auto', modelId: null }

describe('selectTitleModel', () => {
  test('auto picks the cheapest enabled non-free model by total price', () => {
    const models = [
      model({ id: 'cheap', pricing: { prompt: 1, completion: 1 } }),
      model({ id: 'pricey', pricing: { prompt: 5, completion: 5 } }),
    ]
    expect(selectTitleModel(models, auto, ProviderId.enum.anthropic)).toBe('cheap')
  })

  test('auto skips free models even when they are cheapest', () => {
    const models = [
      model({ id: 'free', pricing: { prompt: 0, completion: 0 } }),
      model({ id: 'paid', pricing: { prompt: 2, completion: 2 } }),
    ]
    expect(selectTitleModel(models, auto, ProviderId.enum.anthropic)).toBe('paid')
  })

  test('auto falls back to the cheap family hint when nothing is priced', () => {
    const models = [
      model({ id: 'sonnet', family: 'sonnet', pricing: null }),
      model({ id: 'haiku', family: 'haiku', pricing: null }),
    ]
    expect(selectTitleModel(models, auto, ProviderId.enum.anthropic)).toBe('haiku')
  })

  test('auto falls back to the first enabled model when unpriced and no family hint matches', () => {
    const models = [
      model({ id: 'first', family: 'opus', pricing: null }),
      model({ id: 'second', family: 'sonnet', pricing: null }),
    ]
    expect(selectTitleModel(models, auto, ProviderId.enum.anthropic)).toBe('first')
  })

  test('custom returns the pinned id when it is still enabled', () => {
    const models = [model({ id: 'pinned' }), model({ id: 'other' })]
    expect(selectTitleModel(models, custom('pinned'), ProviderId.enum.anthropic)).toBe('pinned')
  })

  test('custom with a dead id falls back to auto', () => {
    const models = [model({ id: 'alive', pricing: { prompt: 1, completion: 1 } })]
    expect(selectTitleModel(models, custom('deleted'), ProviderId.enum.anthropic)).toBe('alive')
  })

  test('custom with a disabled pinned id falls back to auto', () => {
    const models = [
      model({ id: 'pinned', isEnabled: false }),
      model({ id: 'fallback', pricing: { prompt: 1, completion: 1 } }),
    ]
    expect(selectTitleModel(models, custom('pinned'), ProviderId.enum.anthropic)).toBe('fallback')
  })

  test('other providers are ignored, no enabled models yields null', () => {
    const models = [model({ id: 'or', provider: ProviderId.enum.openrouter })]
    expect(selectTitleModel(models, auto, ProviderId.enum.anthropic)).toBeNull()
  })
})
