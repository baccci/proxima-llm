const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()

  if (diff < MINUTE) {
    return 'just now'
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)}m ago`
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)}h ago`
  }
  if (diff < 2 * DAY) {
    return 'yesterday'
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)}d ago`
  }

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function startOfDay(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export type DateGroup = 'today' | 'yesterday' | 'this-week' | 'older'

export function dateGroup(date: Date | string): DateGroup {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = startOfDay(new Date()) - startOfDay(d)

  if (diff <= 0) {
    return 'today'
  }
  if (diff <= DAY) {
    return 'yesterday'
  }
  if (diff <= 6 * DAY) {
    return 'this-week'
  }

  return 'older'
}

export const DATE_GROUP_LABELS: Record<DateGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  'this-week': 'Previous 7 days',
  older: 'Older',
}
