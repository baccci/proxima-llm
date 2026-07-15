// Human-readable message from a caught error, or a fallback when it is not an Error.
export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
