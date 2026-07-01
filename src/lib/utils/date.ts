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

// Returns a human-readable urgency label for push notification first lines.
// Examples: "In 45 min", "In 2 hrs", "Today 2:30 PM", "Tomorrow 9:00 AM", "Wed, 3 Jul"
export function bookingUrgencyLabel(pickupDate: string | null, pickupTime: string | null): string {
  if (!pickupDate) return ''

  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  const todayIST = nowIST.toISOString().slice(0, 10)
  const tomorrowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const timeDisplay = pickupTime ? formatTime(pickupTime) : null

  if (pickupDate === todayIST && pickupTime) {
    const [ph, pm] = pickupTime.split(':').map(Number)
    const nowMinutes = nowIST.getUTCHours() * 60 + nowIST.getUTCMinutes()
    const pickupMinutes = ph * 60 + pm
    const diff = pickupMinutes - nowMinutes
    if (diff > 0 && diff < 60) return `In ${diff} min`
    if (diff >= 60 && diff < 60 * 5) return `In ${Math.floor(diff / 60)} hr${Math.floor(diff / 60) > 1 ? 's' : ''}`
    return `Today ${timeDisplay}`
  }

  if (pickupDate === todayIST) return 'Today'
  if (pickupDate === tomorrowIST) return timeDisplay ? `Tomorrow ${timeDisplay}` : 'Tomorrow'

  const d = new Date(`${pickupDate}T12:00:00+05:30`)
  const dayStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
  return timeDisplay ? `${dayStr} ${timeDisplay}` : dayStr
}
