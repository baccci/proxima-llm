import { describe, expect, test } from 'bun:test'
import type { Effort } from '@shared/models/effort'
import { effortForKey, effortForPosition } from './effort-slider'

const LEVELS: Effort[] = ['low', 'medium', 'high']

describe('effortForKey', () => {
  test('ArrowRight / ArrowUp advance one stop', () => {
    expect(effortForKey(LEVELS, 'low', 'ArrowRight')).toBe('medium')
    expect(effortForKey(LEVELS, 'low', 'ArrowUp')).toBe('medium')
  })

  test('ArrowLeft / ArrowDown retreat one stop', () => {
    expect(effortForKey(LEVELS, 'high', 'ArrowLeft')).toBe('medium')
    expect(effortForKey(LEVELS, 'high', 'ArrowDown')).toBe('medium')
  })

  test('clamps at the ends (no change returns null)', () => {
    expect(effortForKey(LEVELS, 'high', 'ArrowRight')).toBeNull()
    expect(effortForKey(LEVELS, 'low', 'ArrowLeft')).toBeNull()
  })

  test('Home jumps to the first level, End to the last', () => {
    expect(effortForKey(LEVELS, 'high', 'Home')).toBe('low')
    expect(effortForKey(LEVELS, 'low', 'End')).toBe('high')
  })

  test('a non-arrow key does nothing', () => {
    expect(effortForKey(LEVELS, 'low', 'a')).toBeNull()
    expect(effortForKey(LEVELS, 'low', 'Enter')).toBeNull()
  })

  test('disabled blocks the key', () => {
    expect(effortForKey(LEVELS, 'low', 'ArrowRight', true)).toBeNull()
  })

  test('a value off the scale does nothing', () => {
    expect(effortForKey(LEVELS, 'max', 'ArrowRight')).toBeNull()
  })
})

describe('effortForPosition', () => {
  test('maps the track ends to the first and last level', () => {
    expect(effortForPosition(LEVELS, 0)).toBe('low')
    expect(effortForPosition(LEVELS, 1)).toBe('high')
  })

  test('snaps to the nearest stop', () => {
    // Stops for 3 levels sit at 0, 0.5, 1; boundaries at 0.25 / 0.75.
    expect(effortForPosition(LEVELS, 0.1)).toBe('low')
    expect(effortForPosition(LEVELS, 0.4)).toBe('medium')
    expect(effortForPosition(LEVELS, 0.6)).toBe('medium')
    expect(effortForPosition(LEVELS, 0.9)).toBe('high')
  })

  test('clamps a fraction outside 0..1', () => {
    expect(effortForPosition(LEVELS, -0.5)).toBe('low')
    expect(effortForPosition(LEVELS, 1.5)).toBe('high')
  })

  test('disabled blocks the drag', () => {
    expect(effortForPosition(LEVELS, 0.5, true)).toBeNull()
  })

  test('an empty scale is a no-op', () => {
    expect(effortForPosition([], 0.5)).toBeNull()
  })
})
