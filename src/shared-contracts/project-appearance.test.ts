import { describe, expect, test } from 'bun:test'
import { PROJECT_PALETTES, resolvePalette } from './project-appearance'

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
