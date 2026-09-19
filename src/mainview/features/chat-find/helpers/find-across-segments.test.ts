import { describe, expect, test } from 'bun:test'
import { findAcrossSegments } from './find-across-segments'

describe('findAcrossSegments', () => {
  test('finds a match sitting inside one segment', () => {
    expect(findAcrossSegments(['hello world'], 'world')).toEqual([
      { startIndex: 0, startOffset: 6, endIndex: 0, endOffset: 11 },
    ])
  })

  test('finds a match spanning two segments', () => {
    // What a Shiki code block looks like: one <span> per token.
    expect(findAcrossSegments(['const', ' ', 'saved'], 'const saved')).toEqual([
      { startIndex: 0, startOffset: 0, endIndex: 2, endOffset: 5 },
    ])
  })

  test('finds a match that swallows whole segments in the middle', () => {
    expect(findAcrossSegments(['a', 'b', 'c', 'd'], 'abcd')).toEqual([
      { startIndex: 0, startOffset: 0, endIndex: 3, endOffset: 1 },
    ])
  })

  test('ends on the segment holding the last character, not the one after it', () => {
    expect(findAcrossSegments(['find', 'ing'], 'find')).toEqual([
      { startIndex: 0, startOffset: 0, endIndex: 0, endOffset: 4 },
    ])
  })

  test('skips empty segments when placing a boundary', () => {
    expect(findAcrossSegments(['', 'ab', '', 'cd', ''], 'bc')).toEqual([
      { startIndex: 1, startOffset: 1, endIndex: 3, endOffset: 1 },
    ])
  })

  test('finds every occurrence, in reading order', () => {
    expect(findAcrossSegments(['one two ', 'one'], 'one')).toEqual([
      { startIndex: 0, startOffset: 0, endIndex: 0, endOffset: 3 },
      { startIndex: 1, startOffset: 0, endIndex: 1, endOffset: 3 },
    ])
  })

  test('steps past a whole match, so "aa" in "aaaa" counts twice', () => {
    expect(findAcrossSegments(['aa', 'aa'], 'aa')).toEqual([
      { startIndex: 0, startOffset: 0, endIndex: 0, endOffset: 2 },
      { startIndex: 1, startOffset: 0, endIndex: 1, endOffset: 2 },
    ])
  })

  test('matches case-insensitively against a lowercase needle', () => {
    expect(findAcrossSegments(['The Key', 'chain'], 'keychain')).toEqual([
      { startIndex: 0, startOffset: 4, endIndex: 1, endOffset: 5 },
    ])
  })

  test('treats the query literally, not as a regex', () => {
    expect(findAcrossSegments(['call foo', '(bar)'], 'foo(')).toHaveLength(1)
    expect(findAcrossSegments(['call foo', '(bar)'], 'f.o')).toHaveLength(0)
  })

  test('finds nothing in an empty row or for an empty query', () => {
    expect(findAcrossSegments([], 'x')).toEqual([])
    expect(findAcrossSegments(['abc'], '')).toEqual([])
  })
})
