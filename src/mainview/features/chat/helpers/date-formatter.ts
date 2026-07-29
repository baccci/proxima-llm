const DAY_MS = 1000 * 60 * 60 * 24
const WEEK_MS = 7 * DAY_MS

export function dateFormatter(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const chatDate = new Date(date)

  const lessThanAWeekAgo = chatDate > new Date(Date.now() - WEEK_MS)
  const isToday = chatDate.toDateString() === today.toDateString()
  const isYesterday = chatDate.toDateString() === yesterday.toDateString()

  if (isToday) {
    return 'Today'
  }

  if (isYesterday) {
    return 'Yesterday'
  }

  if (lessThanAWeekAgo) {
    const daysSince = Math.ceil((today.getTime() - chatDate.getTime()) / DAY_MS)
    return `${daysSince} day${daysSince > 1 ? 's' : ''} ago`
  }

  const dateString = chatDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  return dateString || ''
}
