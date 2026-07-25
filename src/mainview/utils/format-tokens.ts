const MILLION = 1_000_000
const THOUSAND = 1_000

export function formatTokens(n: number): string {
  if (n >= MILLION) {
    return `${(n / MILLION).toFixed(1).replace(/\.0$/, '')}M`
  }

  if (n >= THOUSAND) {
    return `${Math.round(n / THOUSAND)}K`
  }

  return String(n)
}
