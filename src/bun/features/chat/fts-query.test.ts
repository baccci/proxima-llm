import { describe, expect, it } from 'bun:test'
import { toFtsQuery } from './fts-query'

describe('toFtsQuery', () => {
  it('quotes a single token and lets it match as a prefix', () => {
    expect(toFtsQuery('keychain')).toBe('"keychain"*')
  })

  it('quotes every token, with the prefix star only on the last', () => {
    expect(toFtsQuery('keychain ffi port')).toBe('"keychain" "ffi" "port"*')
  })

  it('drops the FTS5 operators that would otherwise be a syntax error', () => {
    expect(toFtsQuery('keychain OR (ffi')).toBe('"keychain" "OR" "ffi"*')
    expect(toFtsQuery('unbalanced " quote')).toBe('"unbalanced" "quote"*')
    expect(toFtsQuery('trailing *')).toBe('"trailing"*')
  })

  it('keeps letters from outside ASCII', () => {
    expect(toFtsQuery('mañana café')).toBe('"mañana" "café"*')
  })

  it('keeps digits and underscores, which are part of real identifiers', () => {
    expect(toFtsQuery('use_mount_effect v2')).toBe('"use_mount_effect" "v2"*')
  })

  it('returns null when nothing searchable is left', () => {
    expect(toFtsQuery('')).toBeNull()
    expect(toFtsQuery('   ')).toBeNull()
    expect(toFtsQuery('?!*()"')).toBeNull()
  })
})
