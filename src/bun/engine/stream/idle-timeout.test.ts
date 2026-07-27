import { describe, expect, test } from 'bun:test'
import { createIdleTimeout } from './idle-timeout'
import { IDLE_TIMEOUT_ERROR_NAME } from './stream-result'

describe('createIdleTimeout', () => {
  test('fires after the timeout, aborting with the idle-timeout name', async () => {
    const idle = createIdleTimeout(15)
    expect(idle.signal.aborted).toBe(false)

    await Bun.sleep(40)

    expect(idle.signal.aborted).toBe(true)
    expect(idle.signal.reason).toBeInstanceOf(DOMException)
    expect((idle.signal.reason as DOMException).name).toBe(IDLE_TIMEOUT_ERROR_NAME)
  })

  test('reset defers the fire', async () => {
    const idle = createIdleTimeout(50)

    await Bun.sleep(30)
    idle.reset() // re-arm: next fire is ~50ms from now, not from creation
    await Bun.sleep(30) // 60ms since creation, but only 30ms since reset
    expect(idle.signal.aborted).toBe(false)

    await Bun.sleep(40) // now ~70ms past the re-armed window
    expect(idle.signal.aborted).toBe(true)

    idle.clear()
  })

  test('clear stops it from firing', async () => {
    const idle = createIdleTimeout(15)
    idle.clear()

    await Bun.sleep(40)

    expect(idle.signal.aborted).toBe(false)
  })
})
