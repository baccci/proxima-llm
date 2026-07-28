import { describe, expect, test } from 'bun:test'
import { mapReasoning } from './model-sync.service'

describe('mapReasoning', () => {
  test('reads mandatory true and marks the model as thinking', () => {
    const r = mapReasoning({ mandatory: true }, [])
    expect(r.reasoningMandatory).toBe(true)
    expect(r.thinking).toBe(true)
  })

  test('mandatory is false when the flag is explicitly false', () => {
    expect(mapReasoning({ mandatory: false }, []).reasoningMandatory).toBe(false)
  })

  test('mandatory defaults to false when the flag is absent', () => {
    expect(mapReasoning({ supported_efforts: ['high'] }, []).reasoningMandatory).toBe(false)
  })

  test('sorts supported_efforts low→high and keeps minimal', () => {
    const r = mapReasoning({ supported_efforts: ['high', 'minimal', 'medium', 'low'] }, [])
    expect(r.efforts).toEqual(['minimal', 'low', 'medium', 'high'])
  })

  test('drops none and unknown tokens from supported_efforts', () => {
    const r = mapReasoning({ supported_efforts: ['none', 'low', 'ultra', 'high'] }, [])
    expect(r.efforts).toEqual(['low', 'high'])
  })

  test('parses default_effort when valid, else null', () => {
    expect(mapReasoning({ default_effort: 'medium' }, []).defaultEffort).toBe('medium')
    expect(mapReasoning({ default_effort: 'none' }, []).defaultEffort).toBeNull()
  })

  test('no reasoning object falls back to the supported_parameters check, empty efforts', () => {
    const r = mapReasoning(null, ['reasoning'])
    expect(r.thinking).toBe(true)
    expect(r.efforts).toEqual([])
    expect(r.reasoningMandatory).toBe(false)
    expect(r.defaultEffort).toBeNull()
  })

  test('no reasoning object and no reasoning param means not thinking', () => {
    expect(mapReasoning(undefined, ['tools']).thinking).toBe(false)
  })
})
