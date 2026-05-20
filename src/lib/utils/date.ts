import { isToday, isTomorrow, parseISO, format } from 'date-fns'

// Standard date format for all UI and outbound messages: dd-mm-yyyy (e.g. 20-05-2026)
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'TBD'
  const [year, month, day] = dateStr.split('-')
  return `${day}-${month}-${year}`
}

// Standard time format: 09:00 AM / 09:00 PM (always two digits on hour)
export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return 'TBD'
  const [hh, mm] = timeStr.split(':').map(Number)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  const h12 = hh % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`
}

export function formatBookingDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const date = parseISO(dateStr)
  const dateFormatted = formatDate(dateStr)
  if (isToday(date)) return `${dateFormatted} (Today)`
  if (isTomorrow(date)) return `${dateFormatted} (Tomorrow)`
  return dateFormatted
}

export function formatBookingDateTime(dateStr: string | null, timeStr: string | null): string {
  const datePart = formatBookingDate(dateStr)
  if (!timeStr) return datePart
  return `${datePart}, ${formatTime(timeStr)}`
}

export function formatTimestamp(ts: string): string {
  return format(parseISO(ts), 'dd-MM-yyyy, hh:mm a')
}
