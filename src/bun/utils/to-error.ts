// Coerce an unknown thrown value into a real Error. try/catch and event handlers
// hand back `unknown`, so a non-Error value gets wrapped around its stringified form.
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }

  return new Error(String(value))
}

// The message of an unknown thrown value: the Error's own message, or the value's
// stringified form when it isn't an Error.
export function toErrorMessage(value: unknown): string {
  return toError(value).message
}
