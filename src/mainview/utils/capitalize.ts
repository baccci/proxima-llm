// Uppercase the first character, leave the rest untouched.
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
