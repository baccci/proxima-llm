// Where one occurrence of the query sits inside a run of adjacent text segments.
//
// A match can begin in one segment and end in another, which is the whole reason this
// type exists: Shiki wraps every token of a code block in its own <span>, so `const saved`
// is two text nodes on screen and would never be found by searching either one alone.
export type SegmentMatch = {
  // Index of the segment holding the match's first character, and the offset within it.
  startIndex: number
  startOffset: number
  // Index of the segment holding the match's last character, and the offset just past it.
  // The end is kept on the segment that actually contains the final character rather than
  // rolling onto the next one, so a Range built from this never points at an empty node.
  endIndex: number
  endOffset: number
}

// Every occurrence of `needle` across `texts` read as one continuous string, in order.
//
// The painter walks a row's text nodes and hands their contents here, then maps each
// result back to a Range with setStart/setEnd on two different nodes. Splitting it out
// keeps the part that can be wrong away from the DOM, where it can be tested.
//
// `needle` is expected lowercase, the same shape `findMatches` scans with, so both layers
// agree on what counts as a match.
export function findAcrossSegments(texts: string[], needle: string): SegmentMatch[] {
  if (needle.length === 0 || texts.length === 0) {
    return []
  }

  const haystack = texts.join('').toLowerCase()
  const matches: SegmentMatch[] = []

  // Offset at which each segment starts in the joined string. Walking it with a cursor
  // that only moves forward keeps the whole pass linear, which matters because a large
  // code block is thousands of one-token segments.
  const starts = segmentStarts(texts)
  let cursor = 0

  let at = haystack.indexOf(needle)
  while (at !== -1) {
    const last = at + needle.length - 1

    cursor = segmentAt(starts, texts, at, cursor)
    const startIndex = cursor
    const endIndex = segmentAt(starts, texts, last, cursor)

    matches.push({
      startIndex,
      startOffset: at - starts[startIndex],
      endIndex,
      endOffset: last + 1 - starts[endIndex],
    })

    // Step past the whole match, so "aa" in "aaaa" counts twice rather than three times.
    // Same rule findMatches uses, or the two layers would disagree on the count.
    at = haystack.indexOf(needle, at + needle.length)
  }

  return matches
}

function segmentStarts(texts: string[]): number[] {
  const starts: number[] = []
  let offset = 0

  for (const text of texts) {
    starts.push(offset)
    offset += text.length
  }

  return starts
}

// Index of the segment holding the character at `offset`, searching forward from `from`.
// Empty segments are skipped rather than returned: they hold no character, so a Range
// boundary on one would be meaningless.
function segmentAt(starts: number[], texts: string[], offset: number, from: number): number {
  let i = from

  while (i + 1 < texts.length && starts[i] + texts[i].length <= offset) {
    i++
  }

  return i
}
