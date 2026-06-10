'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import {
  Plus, RefreshCw, Send, Car, AlertTriangle, CheckCircle2,
  Clock, UserCheck, ClipboardCheck, BellRing,
  Zap, ArrowRight, CalendarDays, ExternalLink, User,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Booking } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface LegDue {
  leg: {
    id: string; booking_id: string; day_number: number; leg_date: string; leg_status: string
    link_sent_at: string | null
    driver: { id: string; name: string; phone: string; vehicle_name: string | null; vehicle_number: string | null } | null
  }
  booking: {
    id: string; booking_ref: string; guest_name: string | null; trip_type: string; total_days: number
    pickup_time: string | null; pickup_location: string | null; drop_location: string | null
    client: { id: string; name: string } | null
    company: { id: string; name: string } | null
    driver: { id: string; name: string; phone: string; vehicle_name: string | null; vehicle_number: string | null } | null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function localDate(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString('en-CA')
}
function fmtTime(t: string | null) {
  if (!t) return '—'
  const [h, m] = t.split(':'); const hour = parseInt(h)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'pm' : 'am'}`
}
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
function byTime(a: Booking, b: Booking) {
  return (a.pickup_time ?? '99:99') > (b.pickup_time ?? '99:99') ? 1 : -1
}

// ── Week day card ─────────────────────────────────────────────────────────────
function WeekDayCard({ dateStr, trips, selected, onClick }: {
  dateStr: string; trips: Booking[]; selected: boolean; onClick: () => void
}) {
  const d = new Date(dateStr + 'T00:00:00')
  const isToday = dateStr === localDate()
  const active = trips.filter(b => ['confirmed', 'in_progress'].includes(b.status)).length

  return (
    <button onClick={onClick} className={cn(
      'flex-1 min-w-[44px] shrink-0 rounded-xl border p-2.5 text-center transition-all focus:outline-none',
      selected ? 'bg-blue-600 border-blue-600' : isToday ? 'border-blue-300 bg-blue-50' : 'bg-white border-gray-200 hover:border-blue-300',
    )}>
      <p className={cn('text-[10px] font-bold uppercase tracking-wider',
        selected ? 'text-blue-200' : isToday ? 'text-blue-500' : 'text-gray-400')}>
        {d.toLocaleDateString('en-IN', { weekday: 'short' })}
      </p>
      <p className={cn('text-xl font-black leading-tight mt-0.5',
        selected ? 'text-white' : isToday ? 'text-blue-700' : 'text-gray-800')}>
        {d.getDate()}
      </p>
      <p className={cn('text-[11px] font-semibold mt-0.5',
        selected ? 'text-blue-100' : trips.length > 0 ? (isToday ? 'text-blue-600' : 'text-gray-500') : 'text-gray-300')}>
        {trips.length > 0 ? `${active}/${trips.length}` : '—'}
      </p>
    </button>
  )
}

// ── Leg link card ─────────────────────────────────────────────────────────────
function LegLinkCard({ item, onSend, sending }: { item: LegDue; onSend: () => void; sending: boolean }) {
  const driver  = item.leg.driver ?? item.booking.driver
  const company = item.booking.company
  const name    = item.booking.guest_name ?? item.booking.client?.name ?? '—'

  return (
    <Link href={`/bookings/${item.booking.id}`}
      className="flex items-center gap-3 px-4 py-3 border-l-4 border-l-amber-400 bg-white hover:bg-amber-50/40 transition-colors">
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0 whitespace-nowrap">
        Day {item.leg.day_number}{item.booking.total_days ? ` of ${item.booking.total_days}` : ''}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-gray-400 leading-none mb-0.5">{item.booking.booking_ref}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
        {company && <p className="text-xs text-gray-400 truncate">{company.name}</p>}
        {driver ? (
          <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            <Car className="w-3 h-3 shrink-0" />
            <span className="truncate font-medium">{driver.name}</span>
            {driver.vehicle_number && <span className="text-gray-400 shrink-0">· {driver.vehicle_number}</span>}
          </p>
        ) : (
          <p className="text-xs text-gray-400 mt-0.5 italic">No driver assigned</p>
        )}
      </div>
      {item.booking.pickup_time && (
        <div className="text-xs text-gray-500 shrink-0 text-right hidden sm:block">
          <Clock className="w-3 h-3 inline mr-0.5" />{fmtTime(item.booking.pickup_time)}
        </div>
      )}
      <Button size="sm" disabled={sending}
        onClick={e => { e.preventDefault(); e.stopPropagation(); onSend() }}
        className="shrink-0 text-xs h-7 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white gap-1">
        {sending ? '…' : <><Send className="w-3 h-3" />Send</>}
      </Button>
    </Link>
  )
}

// ── Calendar-style booking tile ───────────────────────────────────────────────
const TILE_CHIP: Record<string, string> = {
  confirmed:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress:      'bg-amber-50 text-amber-700 border-amber-200',
  completed:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft:            'bg-gray-100 text-gray-600 border-gray-200',
  pending_approval: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  cancelled:        'bg-red-50 text-red-400 border-red-100 line-through',
}
const TILE_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', in_progress: 'In Progress', completed: 'Completed',
  draft: 'Draft', pending_approval: 'Pending', cancelled: 'Cancelled',
}

function BookingTile({ booking }: { booking: Booking & { _legDay?: number } }) {
  const company = booking.company as { id: string; name: string } | null | undefined
  const driver  = booking.driver  as { name: string; vehicle_number?: string | null } | null | undefined

  return (
    <Link href={`/bookings/${booking.id}`}
      className={cn('block bg-white rounded-xl border p-3 space-y-2 hover:shadow-md transition-shadow', TILE_CHIP[booking.status])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono text-gray-400">{booking.booking_ref}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{booking.guest_name ?? booking.requested_by ?? '—'}</p>
          {company && <p className="text-xs text-gray-500 truncate">{company.name}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-semibold border', TILE_CHIP[booking.status])}>
            {TILE_LABEL[booking.status] ?? booking.status}
          </span>
          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
        </div>
      </div>

      {booking._legDay && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
            Day {booking._legDay}{booking.total_days ? ` of ${booking.total_days}` : ''}
          </span>
          <span className="text-[10px] text-gray-400">continuation</span>
        </div>
      )}

      {booking.pickup_time && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3 h-3 shrink-0" />
          {fmtTime(booking.pickup_time)}
          {booking.trip_type && <span className="ml-1 px-1.5 py-0.5 bg-gray-100 rounded-full text-gray-500">{booking.trip_type}</span>}
        </div>
      )}

      {booking.pickup_location && (
        <p className="text-xs text-gray-500 truncate">
          <span className="text-gray-400">From </span>{booking.pickup_location}
        </p>
      )}
      {booking.drop_location && (
        <p className="text-xs text-gray-500 truncate">
          <span className="text-gray-400">To </span>{booking.drop_location}
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
            <User className="w-3 h-3 text-gray-300 shrink-0" />
            <span className="text-xs text-gray-400 italic">No driver assigned</span>
          </>
        )}
      </div>
    </Link>
  )
}

function timeToMins(t: string | null): number {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ── Driver alert card ─────────────────────────────────────────────────────────
function DriverAlertRow({ booking, message, severity }: {
  booking: Booking; message: string; severity: 'critical' | 'warning'
}) {
  const cfg = severity === 'critical'
    ? { border: 'border-l-red-500',  bg: 'hover:bg-red-50/30',   dot: 'bg-red-500' }
    : { border: 'border-l-amber-400', bg: 'hover:bg-amber-50/30', dot: 'bg-amber-400' }
  const driver = booking.driver as { name: string; vehicle_number?: string | null } | null | undefined
  const company = booking.company as { name: string } | null | undefined

  return (
    <Link href={`/bookings/${booking.id}`}
      className={cn('flex items-center gap-3 px-4 py-3 border-l-4 bg-white transition-colors', cfg.border, cfg.bg)}>
      <span className={cn('w-2 h-2 rounded-full shrink-0 mt-0.5', cfg.dot)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-gray-400 leading-none mb-0.5">{booking.booking_ref}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{booking.guest_name ?? (booking as any).requested_by ?? '—'}</p>
        {company && <p className="text-xs text-gray-400 truncate">{company.name}</p>}
        <p className="text-xs text-gray-500 mt-0.5">{message}</p>
      </div>
      {driver && (
        <div className="text-xs text-right shrink-0">
          <p className="font-medium text-gray-700">{driver.name}</p>
          {driver.vehicle_number && <p className="text-gray-400">{driver.vehicle_number}</p>}
        </div>
      )}
      <ArrowRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
    </Link>
  )
}

// ── Action queue item ─────────────────────────────────────────────────────────
function ActionRow({
  severity, icon: Icon, title, sub, actionLabel, onAction, actionLoading, href,
}: {
  severity: 'critical' | 'warning' | 'info'
  icon: React.ElementType
  title: string
  sub?: string
  actionLabel?: string
  onAction?: () => void
  actionLoading?: boolean
  href?: string
}) {
  const cfg = {
    critical: { border: 'border-l-red-500',   bg: 'bg-red-50/60',   icon: 'text-red-500',   btn: 'bg-red-600 hover:bg-red-700 text-white' },
    warning:  { border: 'border-l-amber-400',  bg: 'bg-amber-50/60', icon: 'text-amber-500', btn: 'bg-amber-600 hover:bg-amber-700 text-white' },
    info:     { border: 'border-l-blue-300',   bg: 'bg-white',       icon: 'text-blue-400',  btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  }[severity]

  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 border-l-4', cfg.border, cfg.bg)}>
      <Icon className={cn('w-4 h-4 shrink-0', cfg.icon)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{title}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} disabled={actionLoading}
          className={cn('shrink-0 text-xs h-7 px-3 rounded-lg', cfg.btn)}>
          {actionLoading ? '…' : actionLabel}
        </Button>
      )}
      {href && (
        <Link href={href} className="shrink-0 flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, count, href, hrefLabel }: {
  icon: React.ElementType; label: string; count?: number; href?: string; hrefLabel?: string
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-blue-500" />
        <h2 className="text-sm font-bold text-gray-800">{label}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{count}</span>
        )}
      </div>
      {href && (
        <Link href={href} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          {hrefLabel ?? 'View all'} <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient()
  const { data: bookings = [], isLoading, refetch } = useBookings({ includeLegs: true })
  const confirmBooking = useConfirmBooking()
  const cancelBooking  = useCancelBooking()

  const [refreshing,      setRefreshing]      = useState(false)
  const [cancelTarget,    setCancelTarget]    = useState<string | null>(null)
  const [assignTarget,    setAssignTarget]    = useState<Booking | null>(null)
  const [confirmingIds,   setConfirmingIds]   = useState<Set<string>>(new Set())
  const [selectedDay,     setSelectedDay]     = useState(localDate())
  const [legLinkTab,      setLegLinkTab]      = useState<'today' | 'tomorrow'>('today')
  const [sentLegIds,      setSentLegIds]      = useState<Set<string>>(new Set())
  const [sendingDayLinks, setSendingDayLinks] = useState<Set<string>>(new Set())

  const today    = localDate()
  const tomorrow = localDate(1)

  const { data: todayLegsDue    = [] } = useQuery<LegDue[]>({
    queryKey: ['legs-due', today],
    queryFn: () => fetch(`/api/bookings/legs-due?date=${today}`).then(r => r.json()),
    refetchInterval: 30000,
  })
  const { data: tomorrowLegsDue = [] } = useQuery<LegDue[]>({
    queryKey: ['legs-due', tomorrow],
    queryFn: () => fetch(`/api/bookings/legs-due?date=${tomorrow}`).then(r => r.json()),
    refetchInterval: 60000,
  })

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['legs-due'] })])
    setRefreshing(false)
  }

  async function handleSendDayLink(item: LegDue) {
    setSendingDayLinks(s => new Set(s).add(item.leg.id))
    try {
      const res  = await fetch(`/api/bookings/${item.booking.id}/legs/${item.leg.id}/send-links`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Day ${item.leg.day_number} links sent to ${item.leg.driver?.name ?? 'driver'}`)
      setSentLegIds(s => new Set(s).add(item.leg.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send links')
    } finally {
      setSendingDayLinks(s => { const n = new Set(s); n.delete(item.leg.id); return n })
    }
  }

  async function handleConfirm(id: string) {
    setConfirmingIds(s => new Set(s).add(id))
    try {
      await confirmBooking.mutateAsync({ id })
      toast.success('Booking confirmed')
    } catch { toast.error('Failed to confirm') }
    finally { setConfirmingIds(s => { const n = new Set(s); n.delete(id); return n }) }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const inProgress        = bookings.filter(b => b.status === 'in_progress')
  const pendingApproval   = bookings.filter(b => b.status === 'pending_approval')
  const needConfirm       = bookings.filter(b => b.status === 'draft')
  const needDriver        = bookings.filter(b => b.status === 'confirmed' && !b.driver_id)
  const urgentNoDriver    = needDriver.filter(b => b.pickup_date === today || b.pickup_date === tomorrow)
  const approvalUrgent    = pendingApproval.filter(b => b.pickup_date === today || b.pickup_date === tomorrow)
  const nonUrgentApproval = pendingApproval.filter(b => b.pickup_date !== today && b.pickup_date !== tomorrow)
  const nonUrgentNoDriver = needDriver.filter(b => b.pickup_date !== today && b.pickup_date !== tomorrow)
  const todayAll          = bookings.filter(b => b.pickup_date === today && b.status !== 'cancelled')
  const completedToday    = bookings.filter(b => b.status === 'completed' && b.pickup_date === today)
  const flagged           = bookings.filter(b => ((b.flags as string[] | undefined)?.length ?? 0) > 0 && !['completed','cancelled'].includes(b.status))

  // Driver follow-up alerts (time-based, recalculated each render/refresh)
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes()

  const pickupOverdue = bookings.filter(b =>
    b.status === 'confirmed' &&
    b.pickup_date === today &&
    b.pickup_time !== null &&
    timeToMins(b.pickup_time) + 30 < nowMins
  )
  const airportOverdue = bookings.filter(b =>
    b.status === 'in_progress' &&
    b.trip_type === 'airport' &&
    b.pickup_date === today &&
    b.pickup_time !== null &&
    timeToMins(b.pickup_time) + 120 < nowMins
  )
  const localNotClosed = bookings.filter(b =>
    b.status === 'in_progress' &&
    b.trip_type === 'local' &&
    b.pickup_date === today &&
    nowMins >= 21 * 60
  )
  const outstationLastDay = bookings.filter(b => {
    if (b.status !== 'in_progress' || b.trip_type !== 'outstation' || !b.pickup_date) return false
    const last = new Date(b.pickup_date + 'T00:00:00')
    last.setDate(last.getDate() + (b.total_days || 1) - 1)
    return last.toLocaleDateString('en-CA') === today && nowMins >= 20 * 60
  })

  const driverAlerts: { booking: Booking; severity: 'critical' | 'warning'; message: string }[] = [
    ...pickupOverdue.map(b => ({ booking: b, severity: 'critical' as const, message: `Pickup at ${fmtTime(b.pickup_time)} — driver hasn't started trip` })),
    ...airportOverdue.map(b => ({ booking: b, severity: 'critical' as const, message: `Airport trip (${fmtTime(b.pickup_time)}) running over 2 hrs — follow up` })),
    ...localNotClosed.map(b => ({ booking: b, severity: 'warning'  as const, message: `Local trip not closed — ask driver to submit duty details` })),
    ...outstationLastDay.map(b => ({ booking: b, severity: 'warning' as const, message: `Outstation last day — trip not yet closed by driver` })),
  ]

  const unsentTodayLegs    = todayLegsDue.filter(i => !i.leg.link_sent_at && !sentLegIds.has(i.leg.id))
  const unsentTomorrowLegs = tomorrowLegsDue.filter(i => !i.leg.link_sent_at && !sentLegIds.has(i.leg.id))
  const currentLegsDue     = legLinkTab === 'today' ? unsentTodayLegs : unsentTomorrowLegs

  const totalUrgentActions = urgentNoDriver.length + approvalUrgent.length
  const allClear = totalUrgentActions === 0 && needConfirm.length === 0 && nonUrgentApproval.length === 0 && nonUrgentNoDriver.length === 0 && flagged.length === 0

  // Week data: today + 6 days (includes continuation leg dates for multi-day bookings)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = localDate(i)
    const trips = bookings.filter(b => {
      if (b.status === 'cancelled') return false
      if (b.pickup_date === d) return true
      // Also include bookings with a non-cancelled leg on this date
      return (b.booking_legs ?? []).some(l => l.leg_date === d && l.leg_status !== 'cancelled' && b.pickup_date !== d)
    })
    return { date: d, trips }
  }), [bookings])

  const selectedDayTrips = useMemo(() => {
    const trips: Array<Booking & { _legDay?: number }> = []
    for (const b of bookings) {
      if (b.status === 'cancelled') continue
      if (b.pickup_date === selectedDay) {
        trips.push(b)
        continue
      }
      const leg = (b.booking_legs ?? []).find(l => l.leg_date === selectedDay && l.leg_status !== 'cancelled')
      if (leg) trips.push({ ...b, _legDay: leg.day_number })
    }
    return trips.sort(byTime)
  }, [bookings, selectedDay])

  const todayDateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5 pb-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{todayDateLabel}</p>
          <h1 className="text-2xl font-black text-gray-900 mt-0.5">{greeting()}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {[
              { label: `${todayAll.length} today`,                 show: true,                      cls: 'bg-blue-50 text-blue-700' },
              { label: `${inProgress.length} active`,              show: inProgress.length > 0,     cls: 'bg-amber-50 text-amber-700' },
              { label: `${completedToday.length} done`,            show: completedToday.length > 0, cls: 'bg-emerald-50 text-emerald-700' },
              { label: `${totalUrgentActions} need action`,        show: totalUrgentActions > 0,    cls: 'bg-red-50 text-red-700 font-bold' },
            ].filter(p => p.show).map(p => (
              <span key={p.label} className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', p.cls)}>{p.label}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-1.5 rounded-lg text-xs">
            <RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <ButtonLink href="/bookings/new" size="sm" className="bg-blue-600 hover:bg-blue-700 rounded-lg gap-1.5 text-xs">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Booking</span>
          </ButtonLink>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
      ) : (
        <>
          {/* ── ACTION QUEUE ──────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <SectionHeader icon={Zap} label="Action Required"
              count={totalUrgentActions > 0 ? totalUrgentActions : undefined} />

            <div className="divide-y divide-gray-50">
              {/* 🔴 Critical: no driver today/tomorrow */}
              {urgentNoDriver.sort(byTime).map(b => (
                <ActionRow key={b.id} severity="critical" icon={Car}
                  title={`${b.booking_ref} · ${b.company?.name || b.guest_name || '—'} · ${b.pickup_date === today ? 'Today' : 'Tomorrow'}${b.pickup_time ? ' ' + fmtTime(b.pickup_time) : ''}`}
                  sub="Confirmed — no driver assigned yet"
                  actionLabel="Assign Driver"
                  onAction={() => setAssignTarget(b)}
                />
              ))}

              {/* 🔴 Critical: urgent approvals */}
              {approvalUrgent.sort(byTime).map(b => (
                <ActionRow key={b.id} severity="critical" icon={BellRing}
                  title={`${b.booking_ref} · ${b.company?.name || b.guest_name || '—'} · ${b.pickup_date === today ? 'Today' : 'Tomorrow'}${b.pickup_time ? ' ' + fmtTime(b.pickup_time) : ''}`}
                  sub="Approval pending — trip is coming up"
                  actionLabel="Confirm Now"
                  onAction={() => handleConfirm(b.id)}
                  actionLoading={confirmingIds.has(b.id)}
                />
              ))}

              {/* ℹ️ Info: drafts to confirm */}
              {needConfirm.length > 0 && (
                <ActionRow severity="info" icon={ClipboardCheck}
                  title={`${needConfirm.length} draft booking${needConfirm.length !== 1 ? 's' : ''} waiting to be confirmed`}
                  sub="Review and confirm to assign a driver"
                  href="/bookings?tab=draft"
                />
              )}

              {/* ℹ️ Info: non-urgent approvals */}
              {nonUrgentApproval.length > 0 && (
                <ActionRow severity="info" icon={UserCheck}
                  title={`${nonUrgentApproval.length} booking${nonUrgentApproval.length !== 1 ? 's' : ''} pending company approval`}
                  sub="Waiting for company sign-off — not yet urgent"
                  href="/bookings?tab=pending_approval"
                />
              )}

              {/* ℹ️ Info: upcoming without driver */}
              {nonUrgentNoDriver.length > 0 && (
                <ActionRow severity="info" icon={Car}
                  title={`${nonUrgentNoDriver.length} upcoming confirmed booking${nonUrgentNoDriver.length !== 1 ? 's' : ''} without a driver`}
                  sub="Assign drivers before the pickup date"
                  href="/bookings?tab=confirmed&filter=no_driver"
                />
              )}

              {/* ℹ️ Info: flagged */}
              {flagged.length > 0 && (
                <ActionRow severity="info" icon={AlertTriangle}
                  title={`${flagged.length} flagged booking${flagged.length !== 1 ? 's' : ''}`}
                  sub="Check for duplicates, missing fields, or other issues"
                  href="/bookings?filter=flagged"
                />
              )}

              {/* ✅ All clear */}
              {allClear && (
                <div className="flex items-center gap-3 px-4 py-5 text-sm text-emerald-700">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">All clear</p>
                    <p className="text-xs text-emerald-600">Nothing needs your attention right now.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── DRIVER ACTION REQUIRED ───────────────────────────────── */}
          {driverAlerts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                <BellRing className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-bold text-gray-800">Driver Action Required</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">{driverAlerts.length}</span>
              </div>
              <div className="divide-y divide-gray-50">
                {driverAlerts.map(({ booking, severity, message }) => (
                  <DriverAlertRow key={booking.id} booking={booking} severity={severity} message={message} />
                ))}
              </div>
            </div>
          )}

          {/* ── DRIVER DAY LINKS ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-bold text-gray-800">Driver Day Links</h2>
              </div>
              <div className="flex gap-1.5">
                {([['today', 'Today', unsentTodayLegs.length], ['tomorrow', 'Tomorrow', unsentTomorrowLegs.length]] as const).map(([key, label, count]) => (
                  <button key={key} onClick={() => setLegLinkTab(key)}
                    className={cn('px-2.5 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1',
                      legLinkTab === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
                    {label}
                    {count > 0 && (
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                        legLinkTab === key ? 'bg-blue-500 text-white' : 'bg-white text-gray-500')}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {currentLegsDue.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-6 text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <p className="text-sm font-semibold">
                    All day links sent for {legLinkTab === 'today' ? 'today' : 'tomorrow'}
                  </p>
                </div>
              ) : (
                currentLegsDue.map(item => (
                  <LegLinkCard key={item.leg.id} item={item}
                    sending={sendingDayLinks.has(item.leg.id)}
                    onSend={() => handleSendDayLink(item)} />
                ))
              )}
            </div>
          </div>

          {/* ── THIS WEEK ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <SectionHeader icon={CalendarDays} label="This Week" />

            {/* Day strip */}
            <div className="flex gap-2 p-4 border-b border-gray-100 overflow-x-auto">
              {weekDays.map(({ date, trips }) => (
                <WeekDayCard key={date} dateStr={date} trips={trips}
                  selected={selectedDay === date}
                  onClick={() => setSelectedDay(date)} />
              ))}
            </div>

            {/* Selected day trips */}
            {selectedDayTrips.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No trips on {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}.
              </div>
            ) : (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedDayTrips.map(b => (
                  <BookingTile key={b.id + (b._legDay ?? '')} booking={b} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={open => !open && setCancelTarget(null)}
        title="Cancel booking"
        description="Are you sure you want to cancel this booking? This action cannot be undone."
        confirmLabel="Cancel Booking"
        variant="destructive"
        onConfirm={async () => {
          if (cancelTarget) {
            await cancelBooking.mutateAsync({ id: cancelTarget, reason: 'Operator cancelled' })
            toast.success('Booking cancelled')
            setCancelTarget(null)
          }
        }}
        loading={cancelBooking.isPending}
      />

      {assignTarget && (
        <AssignDriverModal booking={assignTarget} open={!!assignTarget} onClose={() => setAssignTarget(null)} />
      )}
    </div>
  )
}
