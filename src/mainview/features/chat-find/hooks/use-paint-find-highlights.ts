import React from 'react'
import { FIND_ROW_ATTRIBUTE, FIND_TEXT_ATTRIBUTE } from '@/features/chat-find/constants'
import type { FindMatch } from '@/features/chat-find/entities/find-match'
import { findAcrossSegments } from '@/features/chat-find/helpers/find-across-segments'
import { firstMatchIndexByMessage } from '@/features/chat-find/helpers/find-matches'
import {
  clearFindHighlights,
  setFindHighlights,
} from '@/features/chat-find/lib/find-highlight-registry'

type PaintFindHighlightsDeps = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  matches: FindMatch[]
  activeIndex: number
  needle: string
  // Signature of the rows the virtualizer currently has mounted. Nothing reads it; it is
  // here so that scrolling to a different stretch of the chat repaints the new rows.
  mountedKey: string
}

type PaintInput = {
  // Global index of each message's first match, prebuilt by the caller. Painting reruns on
  // every mutation batch, so rebuilding this map per run would scale with the whole match
  // list on a query that hits thousands of times.
  firstIndex: Map<string, number>
  activeIndex: number
  needle: string
}

// Tags that do not start a new line of rendered text. Two text nodes separated only by
// these are read as one continuous run, so a match may span them; anything else (a
// paragraph, a list item, a table cell) breaks the run. Without this a query would match
// across the seam between two blocks, where the words are not adjacent on screen and the
// data pass never counted a match.
const INLINE_TAGS = new Set([
  'A',
  'ABBR',
  'B',
  'BDI',
  'BDO',
  'CITE',
  'CODE',
  'DEL',
  'EM',
  'I',
  'INS',
  'KBD',
  'MARK',
  'Q',
  'S',
  'SAMP',
  'SMALL',
  'SPAN',
  'STRONG',
  'SUB',
  'SUP',
  'TIME',
  'U',
  'VAR',
])

// The nearest ancestor that starts its own line, which is what decides whether two text
// nodes belong to the same run.
function blockContainer(node: Node, root: Element): Element {
  let element = node.parentElement

  while (element && element !== root && INLINE_TAGS.has(element.tagName)) {
    element = element.parentElement
  }

  return element ?? root
}

// Ranges covering every occurrence of `needle` inside one rendered text part, in document
// order. The offsets on a FindMatch cannot be reused here: those index the markdown source,
// while this walks the rendered text, where the syntax characters are gone. So the part is
// searched again and its hits are numbered from the message's first global match.
// docs/features/chat-find.md records where the two can disagree.
//
// The search runs over each run of inline-adjacent text nodes joined together, not over one
// node at a time, because Shiki wraps every token of a code block in its own <span>: search
// "const saved" and the two halves live in different nodes. A Range spans nodes natively,
// so one match still paints as one range. Runs stop at anything that starts a new line, or
// a query would match across the seam between two paragraphs, where the words are not
// adjacent on screen and the data pass counted nothing.
function rangesInTextPart(scope: Element, needle: string): Range[] {
  const ranges: Range[] = []
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)

  let run: Node[] = []
  let runBlock: Element | null = null

  function flush(): void {
    findAcrossSegments(
      run.map((node) => node.textContent ?? ''),
      needle,
    ).forEach((match) => {
      const range = document.createRange()
      range.setStart(run[match.startIndex], match.startOffset)
      range.setEnd(run[match.endIndex], match.endOffset)
      ranges.push(range)
    })
  }

  let node = walker.nextNode()
  while (node) {
    const block = blockContainer(node, scope)
    if (block !== runBlock) {
      flush()
      run = []
      runBlock = block
    }

    run.push(node)
    node = walker.nextNode()
  }

  flush()

  return ranges
}

function paint(root: HTMLElement, { firstIndex, activeIndex, needle }: PaintInput): void {
  const rest: Range[] = []
  const active: Range[] = []

  for (const row of root.querySelectorAll(`[${FIND_ROW_ATTRIBUTE}]`)) {
    // A row whose message holds no match needs no walk at all, which is most of them.
    const base = firstIndex.get(row.getAttribute(FIND_ROW_ATTRIBUTE) ?? '')
    if (base === undefined) {
      continue
    }

    // Only the rendered text parts, in the order they appear, because those are exactly
    // what the data pass counted. The rest of the row (thinking trace, tool payloads,
    // sources, token counts, hover actions) is skipped: a hit in any of it would take a
    // number that belongs to a real match and push the active one onto the wrong word.
    let offset = 0
    for (const scope of row.querySelectorAll(`[${FIND_TEXT_ATTRIBUTE}]`)) {
      for (const range of rangesInTextPart(scope, needle)) {
        // Each range lands in exactly one bucket, so the two highlights never overlap and
        // their relative priority never has to be resolved.
        const bucket = base + offset === activeIndex ? active : rest
        bucket.push(range)
        offset++
      }
    }
  }

  setFindHighlights(rest, active)
}

/**
 * Paints the find matches over the message rows the virtualizer has mounted.
 *
 * A recurring imperative DOM effect, quarantined in a named hook per
 * docs/conventions/react.md. It pushes derived state onto something the app does not own,
 * the browser's highlight registry, and has to re-run whenever the query, the current
 * match, or the mounted rows change, so it cannot collapse into a mount effect.
 */
export function usePaintFindHighlights({
  scrollRef,
  matches,
  activeIndex,
  needle,
  mountedKey,
}: PaintFindHighlightsDeps): void {
  // biome-ignore lint/correctness/useExhaustiveDependencies: mountedKey is the repaint trigger for a scroll; scrollRef is stable
  React.useEffect(() => {
    const root = scrollRef.current
    if (!root) {
      return
    }

    // Find is closed, or the query is still too short to have been searched for. Drop any
    // stale paint and, importantly, install no observer: the message list mutates on every
    // streaming token, and watching that while nothing is being highlighted would be pure
    // cost for the whole life of the chat.
    if (needle.length === 0 || matches.length === 0) {
      clearFindHighlights()
      return
    }

    const firstIndex = firstMatchIndexByMessage(matches)
    paint(root, { firstIndex, activeIndex, needle })

    // Rows rewrite themselves after this pass has run: Shiki swaps in a highlighted <pre>
    // when its async highlight resolves, images settle, a thinking block expands. Each of
    // those replaces the very text nodes the ranges point at, so repaint when the subtree
    // changes. Painting never touches the DOM itself, which is the whole point of the
    // Highlight API, so this cannot feed itself. Coalesced to one repaint per frame,
    // because a single scroll can fire hundreds of records.
    //
    // The pending repaint is kept rather than cancelled and rescheduled. Landing on a match
    // re-scrolls for several frames in a row while the virtualizer measures, so a mutation
    // arrives in every one of those frames, and cancelling each time would push the repaint
    // out for as long as the landing lasts.
    let frame = 0
    const observer = new MutationObserver(() => {
      if (frame !== 0) {
        return
      }

      frame = requestAnimationFrame(() => {
        frame = 0
        paint(root, { firstIndex, activeIndex, needle })
      })
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      clearFindHighlights()
    }
  }, [matches, activeIndex, needle, mountedKey])
}
