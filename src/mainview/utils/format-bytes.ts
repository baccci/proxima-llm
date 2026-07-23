// A rounded kilobyte label for a byte count (e.g. an attachment size), like "42KB".
export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`
}
