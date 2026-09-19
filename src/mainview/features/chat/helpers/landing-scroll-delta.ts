// A vertical span in viewport coordinates: the top and bottom edges of a DOMRect, which is
// all the landing arithmetic needs from one.
export type VerticalSpan = {
  top: number
  bottom: number
}

type LandingOptions = {
  // The match to bring into view.
  match: VerticalSpan
  // The scroll container's own box, in the same viewport coordinates.
  view: VerticalSpan
  // Pixels at the top of the container covered by the floating header, which is an overlay
  // rather than a sibling, so the container's own top edge is not where reading starts.
  topInset: number
  // Where in the clear band a match that has to move is parked, as a fraction from its top.
  // A third down leaves the lines leading into the match readable and the ones after it
  // visible, which landing at an edge does not.
  fraction: number
}

// Smaller than this and the correction is below what a reader could notice, so it is not
// worth a scroll write that would keep the landing loop running another frame.
const NEGLIGIBLE_PX = 1

/**
 * How far to move `scrollTop` to bring a find match into comfortable view, or 0 to leave the
 * scroll exactly where it is.
 *
 * A match already inside the clear band returns 0 deliberately. Stepping to a match that is
 * on screen already should not throw the reader's eye across the page, and it is the whole
 * reason a near step used to jump to an edge: the old landing aimed at the message row's top
 * and so always had somewhere to go.
 */
export function landingScrollDelta({ match, view, topInset, fraction }: LandingOptions): number {
  const clearTop = view.top + topInset

  if (match.top >= clearTop && match.bottom <= view.bottom) {
    return 0
  }

  const target = clearTop + (view.bottom - clearTop) * fraction
  const delta = match.top - target

  return Math.abs(delta) <= NEGLIGIBLE_PX ? 0 : delta
}
