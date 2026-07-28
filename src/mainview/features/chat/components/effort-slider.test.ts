import { describe, expect, test } from 'bun:test'
import type { Effort } from '@shared/models/effort'
import { effortForClick, effortForKey } from './effort-slider'

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

describe('effortForClick', () => {
  test('returns the level at the clicked stop', () => {
    expect(effortForClick(LEVELS, 0)).toBe('low')
    expect(effortForClick(LEVELS, 2)).toBe('high')
  })

  test('an out-of-range index is a no-op', () => {
    expect(effortForClick(LEVELS, -1)).toBeNull()
    expect(effortForClick(LEVELS, 3)).toBeNull()
  })

  test('disabled blocks the click', () => {
    expect(effortForClick(LEVELS, 1, true)).toBeNull()
  })
})
