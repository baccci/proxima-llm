import { describe, expect, it } from 'bun:test'
import { isWindowFocused, setWindowFocused } from './window-focus'

describe('window focus tracker', () => {
  it('defaults to focused and reflects updates', () => {
    expect(isWindowFocused()).toBe(true)
    setWindowFocused(false)
    expect(isWindowFocused()).toBe(false)
    setWindowFocused(true)
    expect(isWindowFocused()).toBe(true)
  })
})
