import { describe, expect, test } from 'bun:test'
import { ProviderId } from '../providers/registry'
import type { ModelDTO } from '../schemas/model.schema'
import { isFreeModel } from './pricing'

function model(over: Partial<ModelDTO> = {}): ModelDTO {
  return {
    id: 'anthropic/m1',
    provider: ProviderId.enum.anthropic,
    family: 'sonnet',
    displayName: 'M1',
    capabilities: {
      thinking: false,
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

describe('isFreeModel', () => {
  test('zero prompt and completion price is free, for any provider', () => {
    expect(isFreeModel(model({ pricing: { prompt: 0, completion: 0 } }))).toBe(true)
  })

  test('a priced model is not free', () => {
    expect(isFreeModel(model({ pricing: { prompt: 2, completion: 3 } }))).toBe(false)
  })

  test('a priced :free id is not free — a known price beats the label', () => {
    const m = model({
      provider: ProviderId.enum.openrouter,
      id: 'x/y:free',
      pricing: { prompt: 1, completion: 1 },
    })
    expect(isFreeModel(m)).toBe(false)
  })

  test('an unpriced OpenRouter :free id is free — the suffix fallback', () => {
    const m = model({ provider: ProviderId.enum.openrouter, id: 'x/y:free', pricing: null })
    expect(isFreeModel(m)).toBe(true)
  })

  test('an unpriced OpenRouter model without the :free suffix is not free', () => {
    const m = model({ provider: ProviderId.enum.openrouter, id: 'x/y', pricing: null })
    expect(isFreeModel(m)).toBe(false)
  })

  test('the :free suffix fallback is scoped to OpenRouter', () => {
    const m = model({ provider: ProviderId.enum.anthropic, id: 'x/y:free', pricing: null })
    expect(isFreeModel(m)).toBe(false)
  })

  test('null pricing with no free signal is not free (unknown, not zero)', () => {
    expect(isFreeModel(model({ pricing: null }))).toBe(false)
  })
})
