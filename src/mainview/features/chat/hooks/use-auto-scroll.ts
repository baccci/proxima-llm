import React from 'react'

// Distance from the bottom (px) within which the user counts as "at the bottom":
// close enough that we keep the view pinned as new content streams in.
const STICK_TO_BOTTOM_PX = 120

type AutoScrollDeps = {
  // Values that grow as the conversation advances. When they change and the user
  // is near the bottom, the view follows the new content down.
  messageCount: number
  streamingText: string | undefined
}

// Owns the message-list scroll behavior: an initial jump to the newest message,
// stick-to-bottom while streaming, and the "scroll to bottom" affordance. Auto
// scroll is an irreducible DOM side effect, so the effects are quarantined here
// (a named DOM hook) rather than left loose in the component.
export function useAutoScroll({ messageCount, streamingText }: AutoScrollDeps) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const [showScrollToBottom, setShowScrollToBottom] = React.useState(false)

  function getDistanceFromBottom() {
    const el = scrollRef.current
    if (!el) {
      return 0
    }
    return el.scrollHeight - el.scrollTop - el.clientHeight
  }

  // Jump to the bottom once, when the first messages arrive.
  const didInitRef = React.useRef(false)
  React.useEffect(() => {
    if (didInitRef.current || messageCount === 0) {
      return
    }
    didInitRef.current = true
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messageCount])

  // Follow new content down while the user is near the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: streamingText + messageCount are the triggers; getDistanceFromBottom reads stable refs
  React.useEffect(() => {
    if (getDistanceFromBottom() < STICK_TO_BOTTOM_PX) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [streamingText, messageCount])

  function handleScroll() {
    setShowScrollToBottom(getDistanceFromBottom() > STICK_TO_BOTTOM_PX)
  }

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return { scrollRef, bottomRef, showScrollToBottom, handleScroll, scrollToBottom }
}
