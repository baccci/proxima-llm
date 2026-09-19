import type { MessageDTO } from '@shared/schemas/message.schema'
import { useVirtualizer } from '@tanstack/react-virtual'
import React from 'react'
import { estimateMessageHeight } from '@/features/chat/helpers/estimate-message-height'
import { landingScrollDelta } from '@/features/chat/helpers/landing-scroll-delta'

// Distance from the bottom (px) within which the user counts as "at the bottom":
// close enough that the view keeps following new content as a reply streams in.
const STICK_TO_BOTTOM_PX = 120

// Space reserved above the first message so it clears the floating header overlay.
// Matches the old pt-20 (5rem). Applied as virtualizer padding so it lives inside
// the scroll coordinate space and scrollToIndex stays correct.
const LIST_PADDING_START = 80

// Rows kept mounted just outside the viewport, so scrolling reveals ready content.
const OVERSCAN = 6

// Distance from the bottom, in screens, within which "scroll to bottom" is a true continuous
// scroll that starts from where the user already is (Regime A). Farther up than this a plain
// smooth scroll would be absurdly long, so we use the two-phase reveal below (Regime B).
const SMOOTH_MAX_VIEWPORTS = 5

// Regime B, phase 1: how far (in screens) we smoothly scroll down through the old messages the
// user was reading before cutting away. This is what makes the motion begin under their eyes
// instead of teleporting straight to the bottom.
const REVEAL_OLD_VIEWPORTS = 1

// Regime B, phase 2: after cutting past the long middle we land this many screens above the
// bottom, then travel through the newest messages to the end. Phase 1 + the cut + phase 2 are
// the ~3-screen WhatsApp-style reveal: some old content, a jump past the middle, then the newest.
const SMOOTH_RUNWAY_VIEWPORTS = 1.5

// Regime B travel speed, in screens per animation frame (~60fps). It stays constant so the
// reveal never eases to a stop partway, which is what hides the seam and keeps the motion fluid.
const REVEAL_SPEED_VIEWPORTS = 0.1

// Fraction of the remaining distance the Regime A chase covers each frame. Higher is snappier.
const CHASE_EASE = 0.22

// Close enough to the bottom (px) to snap the final step and stop the chase.
const SETTLE_EPSILON_PX = 1

// Smallest per-frame move (px) so the chase never stalls to a crawl near the target.
const MIN_STEP_PX = 1

// Where a find landing parks the match when it has to move: a third of the way down the band
// the header leaves clear, so the lines leading into the match stay readable and the ones
// after it are on screen too. An edge landing, which aiming at the row's top produced, puts
// the match half under the header or half off the bottom.
const FIND_LANDING_FRACTION = 1 / 3

// Frames a find landing gets to converge: a few to mount the row, a few more while the rows
// above it measure and shift the match under it. It normally settles in two or three.
const FIND_LANDING_ATTEMPTS = 12

// How many times a landing on a far-off message re-scrolls while rows around it measure.
// It normally settles in two or three, so the cap only guards against content that never
// stops resizing.
const LANDING_ATTEMPTS = 10

type MessageVirtualizerDeps = {
  messages: MessageDTO[]
  streamingText: string | undefined
  // A message to land on instead of the newest one, from a search hit. Null opens the
  // chat the ordinary way.
  landOnMessageId: string | null
  // The message holding the current in-chat find match, and which match it is. The index is
  // here because two matches inside one message share an id, so the id alone would not change
  // on the step between them and the landing would never re-fire.
  findMessageId: string | null
  findMatchIndex: number
  // Where the current find match is painted on screen, or null while it is not painted at
  // all. Supplied by the caller rather than read from the find feature here, so this hook
  // stays a scrolling mechanism: it lands on a rect, and does not have to know that the rect
  // comes from a highlight registry.
  getFindMatchRect: () => DOMRect | null
}

// Owns the message-list virtualizer and its scroll side effects. Auto-scroll is an
// irreducible imperative DOM effect, so the raw effects are quarantined here in a
// single named hook. See docs/conventions/react.md.
export function useMessageVirtualizer({
  messages,
  streamingText,
  landOnMessageId,
  findMessageId,
  findMatchIndex,
  getFindMatchRect,
}: MessageVirtualizerDeps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateMessageHeight(messages[index].parts),
    getItemKey: (index) => messages[index].id,
    overscan: OVERSCAN,
    paddingStart: LIST_PADDING_START,
  })

  function distanceFromBottom() {
    const el = scrollRef.current
    if (!el) {
      return 0
    }

    return el.scrollHeight - el.scrollTop - el.clientHeight
  }

  // A smooth scroll that re-reads the live bottom every frame, so it keeps chasing the
  // true end even as rows measure or images and code blocks resize mid-animation. Native
  // scrollTo can't: its target freezes at call time, which is what left the view blank.
  const rafRef = React.useRef(0)
  function chaseToBottom() {
    const el = scrollRef.current
    if (!el) {
      return
    }

    cancelAnimationFrame(rafRef.current)
    const step = () => {
      const target = el.scrollHeight - el.clientHeight
      const remaining = target - el.scrollTop
      if (remaining <= SETTLE_EPSILON_PX) {
        el.scrollTop = target
        return
      }

      // Cap the per-frame move at one screen so a large first step never outruns the
      // virtualizer mounting the rows underneath it.
      el.scrollTop += Math.min(Math.max(MIN_STEP_PX, remaining * CHASE_EASE), el.clientHeight)
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }

  // Regime B: one continuous, constant-speed scroll from where the user is down to the newest,
  // as if the old and new messages were adjacent. Phase 1 rolls ~1 screen through the old
  // messages under their eyes; at the seam we cut past the hundreds of skipped rows to a runway
  // near the bottom; phase 2 keeps the exact same speed through the newest to the end. Constant
  // speed with no stop is what hides the seam and reads as fluid, WhatsApp-style.
  function revealToBottom() {
    const el = scrollRef.current
    if (!el) {
      return
    }

    cancelAnimationFrame(rafRef.current)
    const startTop = el.scrollTop
    const oldSpan = el.clientHeight * REVEAL_OLD_VIEWPORTS
    const newSpan = el.clientHeight * SMOOTH_RUNWAY_VIEWPORTS
    const totalSpan = oldSpan + newSpan
    const speed = el.clientHeight * REVEAL_SPEED_VIEWPORTS

    let travelled = 0
    const step = () => {
      travelled += speed
      if (travelled >= totalSpan) {
        // Settle on the live bottom, chasing any last growth as rows finish measuring.
        chaseToBottom()
        return
      }

      // Phase 1: through the old messages at constant speed.
      if (travelled < oldSpan) {
        el.scrollTop = startTop + travelled
        rafRef.current = requestAnimationFrame(step)
        return
      }

      // Phase 2: past the seam, same speed through the newest. Re-read the bottom each frame
      // so late measures (images, Shiki) can't strand us on an unmeasured gap.
      const runwayStart = el.scrollHeight - el.clientHeight * (1 + SMOOTH_RUNWAY_VIEWPORTS)
      el.scrollTop = runwayStart + (travelled - oldSpan)
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }

  function scrollToBottom() {
    const el = scrollRef.current
    if (!el || messages.length === 0) {
      return
    }

    // Regime A (within the smooth window): chase straight from where the user is. Regime B
    // (farther up): reveal the old messages first, then cut and chase the newest.
    if (distanceFromBottom() > el.clientHeight * SMOOTH_MAX_VIEWPORTS) {
      revealToBottom()
      return
    }

    chaseToBottom()
  }

  function handleScroll() {
    setShowScrollToBottom(distanceFromBottom() > STICK_TO_BOTTOM_PX)
  }

  // True while a landing is still correcting itself, so the follow-new-content effect
  // below leaves the scroll position alone rather than yanking it to the bottom.
  const landingRef = React.useRef(false)

  // Land on a message that can sit far outside the rendered window. The virtualizer puts
  // a row at the sum of the heights before it, and rows it has never mounted contribute
  // estimates, so the first scroll lands near the target rather than on it. Landing
  // mounts those rows, their measured heights replace the estimates, and the target
  // shifts. Re-scrolling after each measurement pass converges, because every pass
  // corrects the rows between the viewport and the target.
  //
  // align 'start' is deliberate. estimateMessageHeight under-guesses more often than it
  // over-guesses, so rows above the target tend to grow, which pushes the target down.
  // Landing it at the top of the viewport turns that drift into a move further into
  // view, rather than off the top edge.
  function landOnIndex(index: number) {
    cancelAnimationFrame(rafRef.current)
    landingRef.current = true

    let attempts = 0
    let lastTop = -1
    const step = () => {
      virtualizer.scrollToIndex(index, { align: 'start' })
      attempts++

      const top = scrollRef.current?.scrollTop ?? 0
      const settled = Math.abs(top - lastTop) <= SETTLE_EPSILON_PX
      if (settled || attempts >= LANDING_ATTEMPTS) {
        landingRef.current = false
        return
      }

      lastTop = top
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
  }

  // Open at the newest message the first time this chat's messages arrive, or at the one
  // a search hit pointed to. The list is keyed by chat id, so the hook remounts per chat
  // and this fires once on open. A raf lets the scroll element and first estimates settle
  // before we scroll.
  const didInitRef = React.useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once when the first messages land
  React.useEffect(() => {
    if (didInitRef.current || messages.length === 0) {
      return
    }

    didInitRef.current = true
    // A hit whose message is no longer in the chat (edited away, or truncated by a retry)
    // falls back to the ordinary open at the newest message.
    const landingIndex = landOnMessageId ? messages.findIndex((m) => m.id === landOnMessageId) : -1

    if (landingIndex === -1) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
      })
      return
    }

    requestAnimationFrame(() => landOnIndex(landingIndex))
  }, [messages.length])

  // Land on the find match itself, rather than on the message row holding it. A match can sit
  // thousands of pixels into a long message, so the row's top is simply the wrong place, and
  // two matches inside one message share a row, so aiming at the row does not move at all on
  // the step between them.
  //
  // One loop covers both halves of the job, because both converge on the same test. While the
  // match is not painted its row is outside the mounted window, so the row is scrolled in the
  // way a search landing does and the loop looks again next frame. Once it is painted the
  // scroll is corrected onto the match. Rows above keep measuring as they mount and push the
  // match around while that happens, and re-reading the rect every frame absorbs that drift,
  // which is the job landOnIndex does for a landing that has no match to aim at.
  function landOnFindMatch(index: number) {
    cancelAnimationFrame(rafRef.current)
    landingRef.current = true

    let attempts = 0

    function settle() {
      landingRef.current = false
    }

    function again() {
      if (attempts >= FIND_LANDING_ATTEMPTS) {
        settle()
        return
      }

      rafRef.current = requestAnimationFrame(step)
    }

    function step() {
      attempts++
      const el = scrollRef.current
      if (!el) {
        settle()
        return
      }

      // Nothing painted: the row is not mounted, so there is no match to measure yet. Bring
      // the row into the window and look again once the painter has caught up.
      const rect = getFindMatchRect()
      if (!rect) {
        virtualizer.scrollToIndex(index, { align: 'start' })
        again()
        return
      }

      const delta = landingScrollDelta({
        match: rect,
        view: el.getBoundingClientRect(),
        topInset: LIST_PADDING_START,
        fraction: FIND_LANDING_FRACTION,
      })

      // Already comfortably in view. Stopping without writing a scroll position is the point:
      // stepping onto a match that is on screen already should leave the page where it is
      // rather than throw the reader's eye across it.
      if (delta === 0) {
        settle()
        return
      }

      const before = el.scrollTop
      el.scrollTop += delta
      // The browser clamps at either end of the list, where the match cannot reach the target
      // however many frames are spent on it.
      if (el.scrollTop === before) {
        settle()
        return
      }

      again()
    }

    rafRef.current = requestAnimationFrame(step)
  }

  // Land on the current find match whenever it moves. Same family as the landing above: a
  // derived value pushed onto scroll position, which React does not model as state.
  //
  // landOnFindMatch starts on the next frame, which it has to. The painter's effect is
  // registered after this one, so at this point the registry still holds the match just
  // stepped away from; every effect in the commit has flushed by the time the frame runs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the match is the trigger; landing reads stable refs
  React.useEffect(() => {
    if (!findMessageId) {
      return
    }

    // A match whose message is gone (edited away, or truncated by a retry) has nowhere to
    // land, and the next query will rebuild the list anyway.
    const index = messages.findIndex((m) => m.id === findMessageId)
    if (index === -1) {
      return
    }

    landOnFindMatch(index)

    // Closing find clears the highlights, so a loop still in flight would find no rect and
    // spend its remaining frames scrolling the row of a match that is no longer current.
    return () => {
      cancelAnimationFrame(rafRef.current)
      landingRef.current = false
    }
  }, [findMessageId, findMatchIndex])

  // Follow new content down while the user is near the bottom: streaming tokens grow
  // the footer and a finished turn appends a row. The streaming bubble is a real node
  // after the virtual list, so scrollHeight already includes it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: streamingText + row count are the triggers; scroll reads a stable ref
  React.useEffect(() => {
    // A landing owns the scroll position until it settles. Following new content here
    // would fight it and drag the view to the bottom instead.
    if (landingRef.current || distanceFromBottom() >= STICK_TO_BOTTOM_PX) {
      return
    }

    const el = scrollRef.current
    el?.scrollTo({ top: el.scrollHeight })
  }, [streamingText, messages.length])

  // Stop any in-flight scroll-to-bottom animation when the list unmounts (chat switch).
  React.useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return { scrollRef, virtualizer, showScrollToBottom, handleScroll, scrollToBottom }
}
