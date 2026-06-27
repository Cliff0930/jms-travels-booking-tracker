'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink, Car, User, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { Booking } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtKey(y: number, m: number, d: number) { return `${y}-${pad(m+1)}-${pad(d)}` }
function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, min] = t.split(':')
  const hour = parseInt(h)
  return `${hour % 12 || 12}:${min} ${hour >= 12 ? 'pm' : 'am'}`
}

const STATUS_DOT: Record<string, string> = {
  draft:            'bg-gray-400',
  pending_approval: 'bg-yellow-400',
  confirmed:        'bg-blue-500',
  in_progress:      'bg-amber-400',
  completed:        'bg-emerald-500',
  cancelled:        'bg-red-400',
}
const STATUS_CHIP: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-600 border-gray-200',
  pending_approval: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  confirmed:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress:      'bg-amber-50 text-amber-700 border-amber-200',
  completed:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled:        'bg-red-50 text-red-400 border-red-100 line-through',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending', confirmed: 'Confirmed',
  in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

// ── types ─────────────────────────────────────────────────────────────────────
type CalBookingLeg = { id: string; day_number: number; leg_date: string; leg_status: string | null }
type CalBooking = Omit<Booking, 'driver' | 'company' | 'client'> & {
  driver?: { id: string; name: string; vehicle_name: string | null; vehicle_number: string | null } | null
  company?: { id: string; name: string } | null
  client?: { id: string; name: string } | null
  booking_legs?: CalBookingLeg[]
  _legDay?: number           // set when booking is shown on a continuation leg date (Day 2+)
  _effectiveStatus?: string  // per-leg derived status for Day 2+ entries
}

function effStatus(b: CalBooking): string {
  return b._effectiveStatus ?? b.status
}

// ── main component ────────────────────────────────────────────────────────────
export default function BookingCalendarPage() {
  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())   // 0-based
  const [selectedDate, setSelectedDate] = useState<string | null>(
    fmtKey(today.getFullYear(), today.getMonth(), today.getDate())
  )
  const [statusFilter, setStatusFilter] = useState<string>('active')

  // Fetch whole month (+1 week buffer each side)
  const dateFrom = fmtKey(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0).getDate()
  const dateTo   = fmtKey(year, month, lastDay)

  const { data: bookings = [], isLoading } = useQuery<CalBooking[]>({
    queryKey: ['bookings-cal', dateFrom, dateTo],
    queryFn: () => fetch(`/api/bookings?date_from=${dateFrom}&date_to=${dateTo}&include_legs=1`).then(r => r.json()),
  })

  // Group by pickup_date AND leg dates (Day 2+)
  const byDate = useMemo(() => {
    const map: Record<string, CalBooking[]> = {}
    const todayStr = fmtKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) // still used for past-date fallback
    for (const b of bookings) {
      if (!b.pickup_date) continue
      const pickupKey = b.pickup_date.slice(0, 10)
      if (!map[pickupKey]) map[pickupKey] = []
      map[pickupKey].push(b)

      // Also plot on each continuation leg date with a per-leg derived status
      for (const leg of (b.booking_legs ?? [])) {
        if (!leg.leg_date || leg.leg_status === 'cancelled') continue
        const legRan = leg.leg_status === 'completed' || leg.leg_status === 'in_progress'
        if (!['confirmed', 'in_progress'].includes(b.status) && !legRan) continue
        const legKey = leg.leg_date.slice(0, 10)
        if (legKey === pickupKey) continue  // Day 1 already added above
        if (!map[legKey]) map[legKey] = []
        if (!map[legKey].find(x => x.id === b.id)) {
          // Use actual leg_status as source of truth (updated by driver-status handler)
          const _effectiveStatus = (() => {
            if (b.status === 'cancelled') return 'cancelled'
            if (leg.leg_status === 'completed') return 'completed'
            if (leg.leg_status === 'in_progress') return 'in_progress'
            // upcoming: past date = must have run (old data fallback), else confirmed
            if (legKey < todayStr) return 'completed'
            return 'confirmed'
          })()
          map[legKey].push({ ...b, _legDay: leg.day_number, _effectiveStatus })
        }
      }
    }
    return map
  }, [bookings])

  // Calendar grid: first cell = Monday of the week containing day 1
  const gridCells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1)
    // getDay(): 0=Sun,1=Mon,…,6=Sat → convert to Mon=0
    const startOffset = (firstOfMonth.getDay() + 6) % 7
    const cells: (number | null)[] = Array(startOffset).fill(null)
    for (let d = 1; d <= lastDay; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [year, month, lastDay])

  function navigate(dir: -1 | 1) {
    let m = month + dir
    let y = year
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setMonth(m); setYear(y)
  }

  const selectedBookings = useMemo(() => {
    if (!selectedDate) return []
    const list = byDate[selectedDate] ?? []
    if (statusFilter === 'active') return list.filter(b => !['cancelled','completed'].includes(effStatus(b)))
    if (statusFilter === 'all')    return list
    return list.filter(b => effStatus(b) === statusFilter)
  }, [byDate, selectedDate, statusFilter])

  const todayKey = fmtKey(today.getFullYear(), today.getMonth(), today.getDate())

  return (
    <div className="flex flex-col lg:flex-row gap-5 h-full min-h-[calc(100vh-5rem)]">
      {/* ── Calendar panel ── */}
      <div className="lg:flex-1 min-w-0 space-y-4">
        {/* Month nav */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-gray-900">{MONTHS[month]} {year}</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(todayKey) }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 mr-2">
              Today
            </button>
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={cn('w-2 h-2 rounded-full', STATUS_DOT[k])} />
              {v}
            </span>
          ))}
        </div>

        {/* Grid */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAYS.map((d, i) => (
              <div key={d + i} className={cn('py-2 text-center text-xs font-bold uppercase tracking-wide text-gray-400',
                (d === 'Sat' || d === 'Sun') && 'bg-gray-50')}>
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{DAYS_SHORT[i]}</span>
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="grid grid-cols-7 divide-x divide-gray-100">
            {gridCells.map((day, i) => {
              const dateKey = day ? fmtKey(year, month, day) : null
              const dayBookings = dateKey ? (byDate[dateKey] ?? []) : []
              const isToday    = dateKey === todayKey
              const isSelected = dateKey === selectedDate
              const isWeekend  = i % 7 >= 5

              // Group dots by status for display (use per-leg effective status for Day 2+ entries)
              const confirmed  = dayBookings.filter(b => effStatus(b) === 'confirmed').length
              const inProgress = dayBookings.filter(b => effStatus(b) === 'in_progress').length
              const completed  = dayBookings.filter(b => effStatus(b) === 'completed').length
              const cancelled  = dayBookings.filter(b => effStatus(b) === 'cancelled').length
              const draft      = dayBookings.filter(b => ['draft','pending_approval'].includes(effStatus(b))).length

              // Alert badge: red = confirmed with no driver, amber = draft/pending
              const noDriverAlert = dayBookings.some(b => {
                const es = effStatus(b)
                return !b.driver && (es === 'confirmed' || es === 'in_progress')
              })
              const draftAlert = dayBookings.some(b => ['draft', 'pending_approval'].includes(effStatus(b)))
              const alertLevel: 'red' | 'amber' | null = noDriverAlert ? 'red' : draftAlert ? 'amber' : null

              return (
                <div
                  key={i}
                  onClick={() => day && dateKey && setSelectedDate(dateKey)}
                  className={cn(
                    'min-h-[52px] sm:min-h-[88px] p-1 sm:p-2 border-b border-gray-100 flex flex-col gap-1 transition-colors',
                    day ? 'cursor-pointer' : 'bg-gray-50/50',
                    isWeekend && day && 'bg-gray-50/40',
                    isSelected && 'bg-blue-50 ring-2 ring-inset ring-blue-400',
                    !isSelected && day && 'hover:bg-gray-50',
                  )}
                >
                  {day && (
                    <>
                      <div className="relative self-start">
                        <span className={cn(
                          'text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full',
                          isToday ? 'bg-blue-600 text-white' : 'text-gray-700'
                        )}>
                          {day}
                        </span>
                        {alertLevel && (
                          <span className="absolute -top-0.5 -right-0.5 flex w-2.5 h-2.5">
                            <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', alertLevel === 'red' ? 'bg-red-400' : 'bg-amber-400')} />
                            <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', alertLevel === 'red' ? 'bg-red-500' : 'bg-amber-500')} />
                          </span>
                        )}
                      </div>

                      {/* Status summary dots */}
                      {dayBookings.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {confirmed  > 0 && <StatusPill count={confirmed}  color="bg-blue-500"    />}
                          {inProgress > 0 && <StatusPill count={inProgress} color="bg-amber-400"   />}
                          {completed  > 0 && <StatusPill count={completed}  color="bg-emerald-500" />}
                          {draft      > 0 && <StatusPill count={draft}      color="bg-gray-400"    />}
                          {cancelled  > 0 && <StatusPill count={cancelled}  color="bg-red-300"     />}
                        </div>
                      )}

                      {/* Mini booking list (up to 2) — hidden on mobile, only dots show */}
                      <div className="hidden sm:block space-y-0.5 mt-0.5">
                        {dayBookings.filter(b => b.status !== 'cancelled').slice(0, 2).map(b => (
                          <div key={b.id + (b._legDay ?? '')} className={cn('text-[10px] leading-tight px-1 py-0.5 rounded border truncate font-medium', STATUS_CHIP[effStatus(b)])}>
                            {b._legDay ? `Day ${b._legDay}` : fmtTime(b.pickup_time)} · {(b.driver as { name: string } | null | undefined)?.name ?? b.guest_name ?? b.client?.name ?? '—'}
                          </div>
                        ))}
                        {dayBookings.filter(b => b.status !== 'cancelled').length > 2 && (
                          <div className="text-[10px] text-gray-400 px-1">
                            +{dayBookings.filter(b => b.status !== 'cancelled').length - 2} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Day detail panel ── */}
      <div className="w-full lg:w-80 lg:shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">
            {selectedDate
              ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
              : 'Select a day'}
          </h2>
          {selectedDate && (byDate[selectedDate]?.length ?? 0) > 0 && (
            <span className="text-xs text-gray-400">{byDate[selectedDate].length} booking{byDate[selectedDate].length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {[['active','Active'], ['all','All'], ['confirmed','Confirmed'], ['completed','Done'], ['cancelled','Cancelled']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                statusFilter === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')}>
              {l}
            </button>
          ))}
        </div>

        {isLoading && <div className="text-sm text-gray-400 text-center py-8">Loading…</div>}

        {!isLoading && selectedDate && selectedBookings.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-8 bg-white rounded-xl border border-gray-200">
            No {statusFilter === 'all' ? '' : statusFilter} bookings
          </div>
        )}

        <div className="space-y-2 overflow-y-auto max-h-[60vh] lg:max-h-[calc(100vh-14rem)]">
          {selectedBookings
            .sort((a, b) => (a.pickup_time ?? '').localeCompare(b.pickup_time ?? ''))
            .map(b => {
              const driver = b.driver as { id: string; name: string; vehicle_name: string | null; vehicle_number: string | null } | null | undefined
              const cardKey = b.id + (b._legDay ?? '')
              const company = b.company as { id: string; name: string } | null | undefined
              const es = effStatus(b)
              const noDriver = !driver && (es === 'confirmed' || es === 'in_progress')
              const isDraft = es === 'draft' || es === 'pending_approval'
              return (
                <Link key={cardKey} href={`/bookings/${b.id}`} className={cn(
                  'block bg-white rounded-xl border p-3 space-y-2 hover:shadow-md transition-shadow',
                  STATUS_CHIP[es],
                  noDriver && '!border-l-4 !border-l-red-500',
                  isDraft && '!border-l-4 !border-l-amber-500',
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-gray-400">{b.booking_ref}</p>
                      <p className="text-sm font-bold text-gray-900 truncate">{b.guest_name ?? b.client?.name ?? b.requested_by ?? '—'}</p>
                      {company && <p className="text-xs text-gray-500 truncate">{company.name}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', STATUS_CHIP[es])}>
                        {STATUS_LABEL[es]}
                      </span>
                      <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                  </div>

                  {(noDriver || isDraft) && (
                    <div className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit', noDriver ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                      ⚠ {noDriver ? 'No Driver Assigned' : es === 'pending_approval' ? 'Awaiting Approval' : 'Draft — Confirm'}
                    </div>
                  )}

                  {b._legDay && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        Day {b._legDay}{b.total_days ? ` of ${b.total_days}` : ''}
                      </span>
                    </div>
                  )}
                  {b.pickup_time && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="w-3 h-3 shrink-0" />
                      {fmtTime(b.pickup_time)}
                      {b.trip_type && <span className="ml-1 px-1.5 py-0.5 bg-gray-100 rounded-full text-gray-500">{b.trip_type}</span>}
                    </div>
                  )}

                  {b.pickup_location && (
                    <p className="text-xs text-gray-500 truncate">
                      <span className="text-gray-400">From </span>{b.pickup_location}
                    </p>
                  )}
                  {b.drop_location && (
                    <p className="text-xs text-gray-500 truncate">
                      <span className="text-gray-400">To </span>{b.drop_location}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                    {driver ? (
                      <>
                        <Car className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="text-xs font-medium text-gray-700 truncate">{driver.name}</span>
                        {driver.vehicle_number && <span className="text-[10px] text-gray-400 shrink-0">{driver.vehicle_number}</span>}
                      </>
                    ) : (
                      <>
                        <User className={cn('w-3 h-3 shrink-0', noDriver ? 'text-red-400' : 'text-gray-300')} />
                        <span className={cn('text-xs italic', noDriver ? 'text-red-500 font-medium' : 'text-gray-400')}>No driver assigned</span>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ count, color }: { count: number; color: string }) {
  return (
    <span className={cn('flex items-center gap-0.5 text-[10px] text-white font-bold px-1 py-0.5 rounded-full leading-none', color)}>
      {count}
    </span>
  )
}
