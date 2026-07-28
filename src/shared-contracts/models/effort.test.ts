import { describe, expect, test } from 'bun:test'
import { compareEffort, type Effort } from './effort'

describe('compareEffort', () => {
  test('sorts efforts low→high by declaration order', () => {
    const shuffled: Effort[] = ['max', 'minimal', 'high', 'low', 'xhigh', 'medium']
    expect([...shuffled].sort(compareEffort)).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
  })

  test('returns 0 for equal efforts', () => {
    expect(compareEffort('medium', 'medium')).toBe(0)
  })

  test('is negative when a ranks below b', () => {
    expect(compareEffort('low', 'high')).toBeLessThan(0)
  })
})
