// FTS5 has a query grammar of its own, so raw user text is not just a bad search, it is a
// syntax error that throws: an unbalanced quote, a parenthesis, a bare OR or NOT, a
// leading star. We keep only letters, digits and underscores, wrap each token as a literal
// phrase, and let the final token match as a prefix so hits appear while the user is still
// typing rather than only once a word is complete.
const TOKEN_PATTERN = /[\p{L}\p{N}_]+/gu

// Null when the input carries nothing searchable (empty, or only punctuation), which the
// caller treats as "no results" rather than running a query that matches everything.
export function toFtsQuery(input: string): string | null {
  const tokens = input.match(TOKEN_PATTERN)
  if (tokens === null) {
    return null
  }

  // Tokens cannot contain a double quote after the filter above, so wrapping each one in
  // quotes needs no escaping.
  return tokens
    .map((token, index) => (index === tokens.length - 1 ? `"${token}"*` : `"${token}"`))
    .join(' ')
}
