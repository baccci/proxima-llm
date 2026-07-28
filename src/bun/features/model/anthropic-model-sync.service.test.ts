import { describe, expect, test } from 'bun:test'
import {
  type AnthropicModel,
  deriveDefaultEffort,
  deriveFamily,
  mapToRow,
  selectNewestPerFamily,
} from './anthropic-model-sync.service'

// A capability leaf as the API reports it: { supported: boolean }.
function leaf(supported: boolean) {
  return { supported }
}

function entry(over: Partial<AnthropicModel> = {}): AnthropicModel {
  return {
    id: 'claude-opus-4-8',
    display_name: 'Claude Opus 4.8',
    created_at: '2026-01-01T00:00:00Z',
    max_input_tokens: 1_000_000,
    max_tokens: 128_000,
    capabilities: {
      image_input: leaf(true),
      thinking: { supported: true, types: { adaptive: leaf(true) } },
      effort: {
        supported: true,
        low: leaf(true),
        medium: leaf(true),
        high: leaf(true),
        xhigh: leaf(true),
        max: leaf(true),
      },
    },
    ...over,
  }
}

describe('deriveFamily', () => {
  test('reads the family token from a modern claude-<family>-<version> id', () => {
    expect(deriveFamily('claude-opus-4-8')).toBe('opus')
    expect(deriveFamily('claude-sonnet-5')).toBe('sonnet')
    expect(deriveFamily('claude-haiku-4-5')).toBe('haiku')
    expect(deriveFamily('claude-fable-5')).toBe('fable')
  })

  test('scans all segments, so a legacy dated id still resolves (not positional)', () => {
    // A positional split would derive '3'; the segment scan finds 'sonnet'.
    expect(deriveFamily('claude-3-5-sonnet-20241022')).toBe('sonnet')
  })

  test('falls back to a segment-based guess for an unknown shape', () => {
    expect(deriveFamily('claude-nova-9')).toBe('nova')
  })
})

describe('deriveDefaultEffort', () => {
  test('prefers medium when supported', () => {
    expect(deriveDefaultEffort(['low', 'medium', 'high'])).toBe('medium')
  })

  test('falls back to the lowest supported effort when medium is absent', () => {
    expect(deriveDefaultEffort(['low', 'high'])).toBe('low')
    expect(deriveDefaultEffort(['xhigh', 'max'])).toBe('xhigh')
  })

  test('is null when nothing is supported', () => {
    expect(deriveDefaultEffort([])).toBeNull()
  })
})

describe('mapToRow', () => {
  test('maps a reasoning flagship: capabilities derived from the API tree', () => {
    const row = mapToRow(entry())

    expect(row.id).toBe('claude-opus-4-8')
    expect(row.provider).toBe('anthropic')
    expect(row.family).toBe('opus')
    expect(row.displayName).toBe('Claude Opus 4.8')
    expect(row.source).toBe('anthropic')
    expect(row.pricing).toBeNull()

    expect(row.capabilities).toEqual({
      thinking: true,
      reasoningMandatory: false,
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'medium',
      vision: true,
      pdf: true,
      tools: true,
      promptCaching: true,
      webSearch: true,
      maxOutputTokens: 128_000,
      contextWindow: 1_000_000,
    })
  })

  test('efforts is empty and non-thinking when the tree reports neither', () => {
    const row = mapToRow(
      entry({
        id: 'claude-sonnet-4-6',
        display_name: 'Claude Sonnet 4.6',
        capabilities: {
          image_input: leaf(true),
          thinking: { supported: false, types: { adaptive: leaf(false) } },
          effort: { supported: false },
        },
      }),
    )
    expect(row.capabilities.thinking).toBe(false)
    expect(row.capabilities.efforts).toEqual([])
    expect(row.capabilities.defaultEffort).toBeNull()
  })

  test('applies the haiku exception table: pdf and webSearch false', () => {
    const row = mapToRow(entry({ id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' }))
    expect(row.family).toBe('haiku')
    expect(row.capabilities.pdf).toBe(false)
    expect(row.capabilities.webSearch).toBe(false)
    // Anthropic-wide defaults still apply to the rest.
    expect(row.capabilities.tools).toBe(true)
    expect(row.capabilities.promptCaching).toBe(true)
  })

  test('non-haiku families keep the pdf / webSearch defaults', () => {
    const row = mapToRow(entry())
    expect(row.capabilities.pdf).toBe(true)
    expect(row.capabilities.webSearch).toBe(true)
  })

  test('a missing capabilities tree degrades to defaults, not a throw', () => {
    const row = mapToRow(entry({ capabilities: undefined }))
    expect(row.capabilities.vision).toBe(false)
    expect(row.capabilities.thinking).toBe(false)
    expect(row.capabilities.efforts).toEqual([])
  })
})

describe('selectNewestPerFamily', () => {
  test('picks the latest created_at per core family', () => {
    const set = selectNewestPerFamily([
      entry({ id: 'claude-opus-4-7', created_at: '2025-11-01T00:00:00Z' }),
      entry({ id: 'claude-opus-4-8', created_at: '2026-01-01T00:00:00Z' }),
      entry({ id: 'claude-sonnet-4-6', created_at: '2025-09-01T00:00:00Z' }),
    ])
    expect(set).toEqual(new Set(['claude-opus-4-8', 'claude-sonnet-4-6']))
  })

  test('excludes non-core families (legacy / premium) from the enable set', () => {
    const set = selectNewestPerFamily([
      entry({ id: 'claude-fable-5', created_at: '2026-02-01T00:00:00Z' }),
      entry({ id: 'claude-haiku-4-5', created_at: '2025-10-01T00:00:00Z' }),
    ])
    expect(set).toEqual(new Set(['claude-haiku-4-5']))
  })

  test('a tie keeps the first-seen id deterministically', () => {
    const set = selectNewestPerFamily([
      entry({ id: 'claude-opus-a', created_at: '2026-01-01T00:00:00Z' }),
      entry({ id: 'claude-opus-b', created_at: '2026-01-01T00:00:00Z' }),
    ])
    expect(set).toEqual(new Set(['claude-opus-a']))
  })
})
