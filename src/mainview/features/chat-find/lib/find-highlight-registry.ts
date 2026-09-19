import { FIND_HIGHLIGHT, FIND_HIGHLIGHT_ACTIVE } from '@/features/chat-find/constants'

// The two Highlight objects find paints through, created once and then mutated for the
// life of the window.
//
// They are never replaced, and that is the point. Registering a fresh
// `new Highlight(...ranges)` under the same name leaves WebKit still painting the ranges
// the previous object held: the registry reads correctly and only the pixels are stale,
// which is the missed-repaint family in docs/conventions/webkit-quirks.md. Emptying the
// object WebKit is already tracking makes it invalidate the ranges it drops, the repaint a
// replacement never asks for.
//
// A singleton, because the registry is one per window: a second pair of objects under the
// same two names would evict the first. See the lib/ vs utils/ note in
// docs/conventions/architecture.md.

type FindHighlights = {
  rest: Highlight
  active: Highlight
}

let highlights: FindHighlights | null = null

// The ranges last painted as the current match, kept as Range rather than read back out of
// the registry, whose members are typed AbstractRange and so cannot be measured. This module
// already knows what find is painting right now, which makes it the one place that can
// answer where the current match sits without a second pass over the DOM.
let activeRanges: Range[] = []

// The browser's highlight registry, or null where the build predates it. Find still counts
// matches and jumps between them without it, so a missing registry costs the paint and
// nothing else. Worth keeping while the app is still macOS-only, since the Windows and
// Linux webviews are the ones likely to lag.
function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS === 'undefined' ? null : (CSS.highlights ?? null)
}

function findHighlights(): FindHighlights | null {
  const registry = highlightRegistry()
  if (!registry) {
    return null
  }

  if (!highlights) {
    highlights = { rest: new Highlight(), active: new Highlight() }
    registry.set(FIND_HIGHLIGHT, highlights.rest)
    registry.set(FIND_HIGHLIGHT_ACTIVE, highlights.active)
  }

  return highlights
}

function fill(highlight: Highlight, ranges: Range[]): void {
  highlight.clear()

  for (const range of ranges) {
    highlight.add(range)
  }
}

// Replaces everything find paints: `rest` in the subtle wash, `active` solid.
export function setFindHighlights(rest: Range[], active: Range[]): void {
  activeRanges = active

  const found = findHighlights()
  if (!found) {
    return
  }

  fill(found.rest, rest)
  fill(found.active, active)
}

/**
 * Where the current match sits on screen, or null when it is not painted.
 *
 * The message list scrolls onto this rather than onto the row holding it. A match can sit
 * thousands of pixels into a long message, and two matches inside one message share a row, so
 * a row is both the wrong place to land and, for a second match in the same message, no move
 * at all.
 *
 * Null carries the other half of the answer: the virtualizer mounts only the rows near the
 * viewport, so nothing painted means the row is not mounted yet and the caller should scroll
 * it into the window and look again.
 */
export function activeFindRect(): DOMRect | null {
  const rect = activeRanges[0]?.getBoundingClientRect()
  // A range whose text nodes were replaced under it, which happens every time Shiki swaps in
  // its highlighted <pre>, still measures but measures empty. That is a stale range awaiting
  // the next repaint, not a position to scroll to.
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return null
  }

  return rect
}

// Unpaints every match. The two highlights stay registered and simply go empty, rather than
// being deleted from the registry: deleting is the same removal WebKit does not repaint.
export function clearFindHighlights(): void {
  activeRanges = []

  if (!highlights) {
    return
  }

  highlights.rest.clear()
  highlights.active.clear()
}
