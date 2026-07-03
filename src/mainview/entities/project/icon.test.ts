import { describe, expect, test } from 'bun:test'
import { composeIconColor, parseIconColor, resolveIconColor } from './icon'

describe('icon color override', () => {
  test('composeIconColor folds opacity into 8-digit hex', () => {
    expect(composeIconColor('#4cfb71', 100)).toBe('#4CFB71FF')
    expect(composeIconColor('#4CFB71', 50)).toBe('#4CFB7180')
    expect(composeIconColor('#4CFB71', 0)).toBe('#4CFB7100')
  })

  test('composeIconColor clamps out-of-range opacity', () => {
    expect(composeIconColor('#000000', 150)).toBe('#000000FF')
    expect(composeIconColor('#000000', -20)).toBe('#00000000')
  })

  test('parseIconColor round-trips a composed value', () => {
    const composed = composeIconColor('#CF3FB9', 60)
    expect(parseIconColor(composed)).toEqual({ base: '#CF3FB9', opacityPct: 60 })
  })

  test('parseIconColor handles null and bare 6-digit hex', () => {
    expect(parseIconColor(null)).toEqual({ base: '', opacityPct: 100 })
    expect(parseIconColor('#123456')).toEqual({ base: '#123456', opacityPct: 100 })
  })

  test('resolveIconColor prefers override, falls back to palette fr', () => {
    expect(resolveIconColor('#FFFFFFAA', { bg: '#000', fr: '#111' })).toBe('#FFFFFFAA')
    expect(resolveIconColor(null, { bg: '#000', fr: '#111' })).toBe('#111')
    expect(resolveIconColor(null, null)).toBeUndefined()
  })
})
