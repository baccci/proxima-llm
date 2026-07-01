import { describe, expect, test } from 'bun:test'
import {
  type CustomPalette,
  composeIconColor,
  isCustomPalette,
  PROJECT_PALETTES,
  parseCustomPalette,
  parseIconColor,
  resolveIconColor,
  resolvePalette,
  serializeCustomPalette,
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
    const light = resolvePalette('terminal', false)
    const dark = resolvePalette('terminal', true)
    expect(light).toEqual({ bg: '#0A0A0A', fr: '#FAFAFA' })
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

describe('custom palette', () => {
  const cp: CustomPalette = {
    light: { bg: '#FFFFFF', fr: '#111111' },
    dark: { bg: '#000000', fr: '#EEEEEE' },
  }

  test('isCustomPalette distinguishes JSON from keys and null', () => {
    expect(isCustomPalette(serializeCustomPalette(cp))).toBe(true)
    expect(isCustomPalette('ocean')).toBe(false)
    expect(isCustomPalette(null)).toBe(false)
  })

  test('serialize/parse round-trips', () => {
    expect(parseCustomPalette(serializeCustomPalette(cp))).toEqual(cp)
  })

  test('parseCustomPalette rejects malformed or wrong-shape input', () => {
    expect(parseCustomPalette('{oops')).toBeNull()
    expect(parseCustomPalette('{"light":{"bg":"#fff"}}')).toBeNull()
    expect(parseCustomPalette('ocean')).toBeNull()
    expect(parseCustomPalette(null)).toBeNull()
  })

  test('resolvePalette resolves a custom value per mode', () => {
    const value = serializeCustomPalette(cp)
    expect(resolvePalette(value, false)).toEqual({ bg: '#FFFFFF', fr: '#111111' })
    expect(resolvePalette(value, true)).toEqual({ bg: '#000000', fr: '#EEEEEE' })
  })

  test('resolvePalette falls back to native on malformed custom JSON', () => {
    expect(resolvePalette('{broken', false)).toBeNull()
  })
})

describe('built-in retouch', () => {
  function find(key: string) {
    const p = PROJECT_PALETTES.find((x) => x.key === key)
    if (!p) throw new Error(`missing ${key}`)
    return p
  }

  test('formerly-fixed palettes are now adaptive', () => {
    for (const key of ['paper', 'clay', 'synthwave', 'hacker', 'sunset']) {
      expect(find(key).light).not.toEqual(find(key).dark)
    }
  })

  test('terminal stays identical in both modes', () => {
    expect(find('terminal').light).toEqual(find('terminal').dark)
  })
})
