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
  Clock, ChevronRight, UserCheck, ClipboardCheck, BellRing,
  Zap, ArrowRight, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Booking } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────
interface TodayLeg {
  id: string; booking_id: string; day_number: number; leg_date: string; leg_status: string
  driver_id: string
  driver: { id: string; name: string; phone: string; vehicle_name: string; vehicle_number: string }
  booking: { id: string; booking_ref: string; guest_name: string | null; trip_type: string; total_days: number; status: string; pickup_location: string | null; drop_location: string | null; client: { name: string } | null }
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

// ── Compact trip row ──────────────────────────────────────────────────────────
function TripRow({ booking, onAssign }: { booking: Booking & { _legDay?: number }; onAssign: (b: Booking) => void }) {
  const guest   = booking.guest_name || booking.client?.name || '—'
  const company = booking.company?.name || (booking.client as { company?: { name?: string } } | undefined)?.company?.name
  const driver  = booking.driver as { name: string; vehicle_number?: string } | undefined | null

  const STATUS_LEFT: Record<string, string> = {
    confirmed:        'border-l-blue-500',
    in_progress:      'border-l-amber-400',
    completed:        'border-l-emerald-500',
    draft:            'border-l-gray-300',
    pending_approval: 'border-l-purple-400',
    cancelled:        'border-l-red-300',
  }
  const STATUS_CHIP: Record<string, string> = {
    confirmed:        'bg-blue-50 text-blue-700',
    in_progress:      'bg-amber-50 text-amber-700',
    completed:        'bg-emerald-50 text-emerald-700',
    draft:            'bg-gray-100 text-gray-500',
    pending_approval: 'bg-purple-50 text-purple-700',
    cancelled:        'bg-red-50 text-red-400',
  }
  const STATUS_LABEL: Record<string, string> = {
    confirmed: 'Confirmed', in_progress: 'Active', completed: 'Done',
    draft: 'Draft', pending_approval: 'Pending', cancelled: 'Cancelled',
  }

  return (
    <Link href={`/bookings/${booking.id}`}
      className={cn('flex items-center gap-3 px-4 py-3 border-l-4 bg-white hover:bg-gray-50 transition-colors group',
        STATUS_LEFT[booking.status] ?? 'border-l-gray-200')}>
      {/* Time / Day indicator */}
      <div className="w-16 shrink-0">
        {booking._legDay
          ? <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">Day {booking._legDay}</span>
          : <span className="text-sm font-bold text-gray-700">{fmtTime(booking.pickup_time)}</span>
        }
      </div>
      {/* Guest + company */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{guest}</p>
        {company && <p className="text-xs text-gray-400 truncate">{company}</p>}
      </div>
      {/* Status chip */}
      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
        STATUS_CHIP[booking.status] ?? 'bg-gray-100 text-gray-500')}>
        {STATUS_LABEL[booking.status] ?? booking.status}
      </span>
      {/* Driver or assign */}
      <div className="shrink-0 w-28 text-right">
        {driver
          ? <p className="text-xs font-medium text-emerald-700 truncate">{driver.name}</p>
          : booking.status === 'confirmed'
            ? <button onClick={e => { e.preventDefault(); onAssign(booking) }}
                className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 transition-colors">
                Assign
              </button>
            : null
        }
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
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

  const [refreshing,    setRefreshing]   = useState(false)
  const [cancelTarget,  setCancelTarget] = useState<string | null>(null)
  const [assignTarget,  setAssignTarget] = useState<Booking | null>(null)
  const [sendingLegs,   setSendingLegs]  = useState<Set<string>>(new Set())
  const [confirmingIds, setConfirmingIds]= useState<Set<string>>(new Set())
  const [selectedDay,   setSelectedDay]  = useState(localDate())

  const today    = localDate()
  const tomorrow = localDate(1)

  const { data: todayLegs = [] } = useQuery<TodayLeg[]>({
    queryKey: ['today-links', today],
    queryFn: () => fetch(`/api/dashboard/today-links?date=${today}`).then(r => r.json()),
    refetchInterval: 30000,
  })

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ['today-links'] })])
    setRefreshing(false)
  }

  async function handleSendLeg(leg: TodayLeg) {
    setSendingLegs(s => new Set(s).add(leg.id))
    try {
      const res  = await fetch(`/api/bookings/${leg.booking_id}/legs/${leg.id}/send-links`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Day ${leg.day_number} links sent to ${leg.driver.name}`)
      qc.invalidateQueries({ queryKey: ['today-links'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send links')
    } finally {
      setSendingLegs(s => { const n = new Set(s); n.delete(leg.id); return n })
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

  const totalUrgentActions = urgentNoDriver.length + approvalUrgent.length + todayLegs.length
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

              {/* 🟡 Warning: multi-day leg links to send */}
              {todayLegs.map(leg => (
                <ActionRow key={leg.id} severity="warning" icon={Send}
                  title={`${leg.booking.booking_ref} · ${leg.booking.client?.name || leg.booking.guest_name || '—'} · Day ${leg.day_number} of ${leg.booking.total_days}`}
                  sub={`Send today's trip links to driver ${leg.driver.name}`}
                  actionLabel={sendingLegs.has(leg.id) ? 'Sending…' : 'Send Links'}
                  onAction={() => handleSendLeg(leg)}
                  actionLoading={sendingLegs.has(leg.id)}
                />
              ))}

              {/* ℹ️ Info: drafts to confirm */}
              {needConfirm.length > 0 && (
                <ActionRow severity="info" icon={ClipboardCheck}
                  title={`${needConfirm.length} draft booking${needConfirm.length !== 1 ? 's' : ''} waiting to be confirmed`}
                  sub="Review and confirm to assign a driver"
                  href="/bookings"
                />
              )}

              {/* ℹ️ Info: non-urgent approvals */}
              {nonUrgentApproval.length > 0 && (
                <ActionRow severity="info" icon={UserCheck}
                  title={`${nonUrgentApproval.length} booking${nonUrgentApproval.length !== 1 ? 's' : ''} pending company approval`}
                  sub="Waiting for company sign-off — not yet urgent"
                  href="/bookings"
                />
              )}

              {/* ℹ️ Info: upcoming without driver */}
              {nonUrgentNoDriver.length > 0 && (
                <ActionRow severity="info" icon={Car}
                  title={`${nonUrgentNoDriver.length} upcoming confirmed booking${nonUrgentNoDriver.length !== 1 ? 's' : ''} without a driver`}
                  sub="Assign drivers before the pickup date"
                  href="/bookings"
                />
              )}

              {/* ℹ️ Info: flagged */}
              {flagged.length > 0 && (
                <ActionRow severity="info" icon={AlertTriangle}
                  title={`${flagged.length} flagged booking${flagged.length !== 1 ? 's' : ''}`}
                  sub="Check for duplicates, missing fields, or other issues"
                  href="/bookings"
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

          {/* ── TODAY'S TRIPS ─────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <SectionHeader icon={Clock} label="Today's Trips" count={todayAll.length}
              href="/bookings/calendar" hrefLabel="Calendar" />

            {todayAll.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">No trips scheduled for today.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {todayAll.sort(byTime).map(b => (
                  <TripRow key={b.id} booking={b} onAssign={setAssignTarget} />
                ))}
              </div>
            )}
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
              <div className="divide-y divide-gray-50">
                {selectedDayTrips.map(b => (
                  <TripRow key={b.id} booking={b} onAssign={setAssignTarget} />
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
