import { describe, expect, test } from 'bun:test';
import { toError, toErrorMessage } from './to-error';

describe('toError', () => {
  test('returns an Error value unchanged', () => {
    const err = new Error('boom');
    expect(toError(err)).toBe(err);
  });

  test('wraps a non-Error string in an Error carrying that text', () => {
    const result = toError('boom');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('boom');
  });

  test('stringifies non-string, non-Error values', () => {
    expect(toError(42).message).toBe('42');
    expect(toError({ a: 1 }).message).toBe('[object Object]');
  });
});

describe('toErrorMessage', () => {
  test("returns an Error's own message", () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  test('stringifies a non-Error value', () => {
    expect(toErrorMessage('nope')).toBe('nope');
    expect(toErrorMessage(42)).toBe('42');
  });
});
