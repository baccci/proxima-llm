import type { MessageDTO } from '@shared/schemas/message.schema'
import { useVirtualizer } from '@tanstack/react-virtual'
import React from 'react'
import { estimateMessageHeight } from '@/features/chat/helpers/estimate-message-height'

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

type MessageVirtualizerDeps = {
  messages: MessageDTO[]
  streamingText: string | undefined
}

// Owns the message-list virtualizer and its scroll side effects. Auto-scroll is an
// irreducible imperative DOM effect, so the raw effects are quarantined here in a
// single named hook. See docs/conventions/react.md.
export function useMessageVirtualizer({ messages, streamingText }: MessageVirtualizerDeps) {
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

  // Jump to the newest message the first time this chat's messages arrive. The list
  // is keyed by chat id, so the hook remounts per chat and this fires once on open.
  // A raf lets the scroll element and first estimates settle before we scroll.
  const didInitRef = React.useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once when the first messages land
  React.useEffect(() => {
    if (didInitRef.current || messages.length === 0) {
      return
    }

    didInitRef.current = true
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
    })
  }, [messages.length])

  // Follow new content down while the user is near the bottom: streaming tokens grow
  // the footer and a finished turn appends a row. The streaming bubble is a real node
  // after the virtual list, so scrollHeight already includes it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: streamingText + row count are the triggers; scroll reads a stable ref
  React.useEffect(() => {
    if (distanceFromBottom() >= STICK_TO_BOTTOM_PX) {
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
