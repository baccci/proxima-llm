// A short "Ns" label for a duration in milliseconds (e.g. how long the model spent reasoning).
export function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`
}
