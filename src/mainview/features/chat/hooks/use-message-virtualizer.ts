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

  function scrollToBottom() {
    const el = scrollRef.current
    if (!el) {
      return
    }

    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
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

  return { scrollRef, virtualizer, showScrollToBottom, handleScroll, scrollToBottom }
}
