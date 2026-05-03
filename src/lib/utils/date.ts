import { format, isToday, isTomorrow, parseISO } from 'date-fns'

export function formatBookingDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = parseISO(dateStr)
  const dateFormatted = format(date, 'd MMM yyyy')
  if (isToday(date)) return `${dateFormatted} (Today)`
  if (isTomorrow(date)) return `${dateFormatted} (Tomorrow)`
  return dateFormatted
}

export function formatBookingDateTime(dateStr: string | null, timeStr: string | null): string {
  const datePart = formatBookingDate(dateStr)
  if (!timeStr) return datePart
  const [h, m] = timeStr.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${datePart}, ${h12}:${m} ${ampm}`
}

export function formatTimestamp(ts: string): string {
  return format(parseISO(ts), 'dd-MM-yyyy, h:mm a')
}
