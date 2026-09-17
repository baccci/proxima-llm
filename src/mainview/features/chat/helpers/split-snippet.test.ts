import { describe, expect, test } from 'bun:test'
import { SNIPPET_MARK_CLOSE, SNIPPET_MARK_OPEN } from '@shared/schemas/chat-search.schema'
import { splitSnippet } from './split-snippet'

function marked(term: string): string {
  return `${SNIPPET_MARK_OPEN}${term}${SNIPPET_MARK_CLOSE}`
}

describe('splitSnippet', () => {
  test('a snippet with no match is one plain segment', () => {
    expect(splitSnippet('plain text')).toEqual([{ text: 'plain text', matched: false }])
  })

  test('splits a match out of its surrounding text', () => {
    expect(splitSnippet(`port the ${marked('keychain')} to linux`)).toEqual([
      { text: 'port the ', matched: false },
      { text: 'keychain', matched: true },
      { text: ' to linux', matched: false },
    ])
  })

  test('handles a match at the very start', () => {
    expect(splitSnippet(`${marked('keychain')} first`)).toEqual([
      { text: 'keychain', matched: true },
      { text: ' first', matched: false },
    ])
  })

  test('handles a match at the very end', () => {
    expect(splitSnippet(`ends with ${marked('keychain')}`)).toEqual([
      { text: 'ends with ', matched: false },
      { text: 'keychain', matched: true },
    ])
  })

  test('keeps every match in a snippet with several', () => {
    const segments = splitSnippet(`${marked('a')} and ${marked('b')}`)
    expect(segments.filter((s) => s.matched).map((s) => s.text)).toEqual(['a', 'b'])
  })

  test('rejoins to the original text without the marks', () => {
    const snippet = `port the ${marked('keychain')} to ${marked('linux')} soon`
    const rejoined = splitSnippet(snippet)
      .map((s) => s.text)
      .join('')
    expect(rejoined).toBe('port the keychain to linux soon')
  })

  test('treats an unclosed mark as plain text rather than dropping it', () => {
    expect(splitSnippet(`broken ${SNIPPET_MARK_OPEN}tail`)).toEqual([
      { text: 'broken ', matched: false },
      { text: 'tail', matched: false },
    ])
  })

  test('an empty snippet yields no segments', () => {
    expect(splitSnippet('')).toEqual([])
  })
})
