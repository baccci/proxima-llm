import { describe, expect, test } from 'bun:test'
import {
  composeIconColor,
  PROJECT_PALETTES,
  parseIconColor,
  resolveIconColor,
  resolvePalette,
} from './project-appearance'

describe('resolvePalette', () => {
  test('null key resolves to native', () => {
    expect(resolvePalette(null, false)).toBeNull()
    expect(resolvePalette(undefined, true)).toBeNull()
  })

  test('unknown key falls back to native', () => {
    expect(resolvePalette('does-not-exist', false)).toBeNull()
  })

  test('fixed palette returns the same pair in both modes', () => {
    const light = resolvePalette('synthwave', false)
    const dark = resolvePalette('synthwave', true)
    expect(light).toEqual({ bg: '#16002A', fr: '#CF3FB9' })
    expect(dark).toEqual(light)
  })

  test('adaptive palette differs per mode', () => {
    expect(resolvePalette('ocean', false)).toEqual({ bg: '#E0F2FE', fr: '#0369A1' })
    expect(resolvePalette('ocean', true)).toEqual({ bg: '#082F49', fr: '#38BDF8' })
  })

  test('exactly ten palettes with unique keys', () => {
    expect(PROJECT_PALETTES).toHaveLength(10)
    expect(new Set(PROJECT_PALETTES.map((p) => p.key)).size).toBe(10)
  })
})

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
