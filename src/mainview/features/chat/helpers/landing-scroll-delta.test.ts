import { describe, expect, test } from 'bun:test'
import { landingScrollDelta, type VerticalSpan } from './landing-scroll-delta'

// A scroll container filling a 900px window, with the floating chat header covering its
// first 80px.
const VIEW: VerticalSpan = { top: 0, bottom: 900 }
const TOP_INSET = 80
const FRACTION = 1 / 3

// Where a match that has to move is parked: a third down the band left clear by the header.
const TARGET = TOP_INSET + (VIEW.bottom - TOP_INSET) * FRACTION

function delta(match: VerticalSpan, view: VerticalSpan = VIEW): number {
  return landingScrollDelta({ match, view, topInset: TOP_INSET, fraction: FRACTION })
}

describe('landingScrollDelta', () => {
  test('a match already in the clear band is left alone', () => {
    expect(delta({ top: 400, bottom: 420 })).toBe(0)
  })

  test('a match below the viewport scrolls down', () => {
    expect(delta({ top: 2000, bottom: 2020 })).toBeGreaterThan(0)
  })

  test('a match above the viewport scrolls up', () => {
    expect(delta({ top: -500, bottom: -480 })).toBeLessThan(0)
  })

  test('a match that has to move is parked a third down the clear band', () => {
    const moved = 2000 - delta({ top: 2000, bottom: 2020 })
    expect(moved).toBeCloseTo(TARGET)
  })

  test('a match hidden behind the header is moved even though it is inside the container', () => {
    // Inside the container box (top >= view.top) but under the floating header, which is the
    // case the old row landing produced on every jump.
    const moved = delta({ top: 20, bottom: 40 })
    expect(moved).toBeLessThan(0)
    expect(20 - moved).toBeCloseTo(TARGET)
  })

  test('a match resting just below the header is comfortable and does not move', () => {
    expect(delta({ top: TOP_INSET + 1, bottom: TOP_INSET + 21 })).toBe(0)
  })

  test('a match cut off by the bottom edge scrolls down', () => {
    expect(delta({ top: 890, bottom: 910 })).toBeGreaterThan(0)
  })

  test('a match already parked at the target returns 0, so the landing loop stops', () => {
    expect(delta({ top: TARGET, bottom: TARGET + 20 })).toBe(0)
  })

  test('a match taller than the clear band parks its top and then settles', () => {
    // Too tall to ever satisfy the comfortable test, so it must still converge on the
    // target rather than scroll every frame.
    const tall = { top: 2000, bottom: 4000 }
    const moved = tall.top - delta(tall)
    expect(moved).toBeCloseTo(TARGET)
    expect(delta({ top: moved, bottom: moved + 2000 })).toBe(0)
  })

  test('a sub-pixel correction is treated as no move at all', () => {
    // Long enough to fail the comfortable test, so the target arithmetic is what answers.
    expect(delta({ top: TARGET + 0.4, bottom: 2000 })).toBe(0)
  })

  test('the container box is read in viewport coordinates, not assumed to start at 0', () => {
    const view: VerticalSpan = { top: 100, bottom: 1000 }
    const moved = 2000 - delta({ top: 2000, bottom: 2020 }, view)
    expect(moved).toBeCloseTo(100 + TOP_INSET + (1000 - 100 - TOP_INSET) * FRACTION)
  })
})
