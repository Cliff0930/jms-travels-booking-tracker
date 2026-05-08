'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { StatCards } from '@/components/dashboard/StatCards'
import { BookingCard } from '@/components/dashboard/BookingCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import {
  Plus, RefreshCw, ArrowRight, Send, Car, MapPin,
  BookOpen, CheckCircle, AlertTriangle, Link2, UserCheck, ClipboardCheck, CalendarX, BellRing,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Booking, Driver } from '@/types'

interface TodayLeg {
  id: string
  booking_id: string
  day_number: number
  leg_date: string
  leg_status: string
  driver_id: string
  driver: Driver
  booking: {
    id: string
    booking_ref: string
    guest_name: string | null
    trip_type: string
    total_days: number
    status: string
    pickup_location: string | null
    drop_location: string | null
    client: { name: string } | null
  }
}

// ── Section wrapper with highlight support ────────────────────────────────────
function OpsSection({
  id,
  title,
  count,
  emptyText,
  viewHref,
  active,
  children,
}: {
  id: string
  title: string
  count: number
  emptyText: string
  viewHref: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={cn(
        'rounded-xl p-4 transition-all scroll-mt-20',
        active ? 'ring-2 ring-[#1A56DB]/30 bg-blue-50/40' : 'bg-transparent'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#737686]">{title}</h2>
          {count > 0 && (
            <span className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full',
              active ? 'bg-[#1A56DB] text-white' : 'bg-[#EDEDF8] text-[#434654]'
            )}>
              {count}
            </span>
          )}
        </div>
        <Link
          href={viewHref}
          className="flex items-center gap-1 text-xs text-[#1A56DB] hover:underline"
        >
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {count === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-6 text-center text-sm text-[#9CA3AF]">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  )
}

// ── Today's leg send card ─────────────────────────────────────────────────────
function TodayLinkCard({ leg, onSent }: { leg: TodayLeg; onSent: () => void }) {
  const [sending, setSending] = useState(false)
  const clientName = leg.booking.client?.name || leg.booking.guest_name || 'Unknown'

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch(`/api/bookings/${leg.booking_id}/legs/${leg.id}/send-links`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Day ${leg.day_number} links sent to ${leg.driver.name}`)
      onSent()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send links')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-[#003fb1] flex items-center justify-center text-white text-sm font-bold shrink-0">
        D{leg.day_number}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/bookings/${leg.booking_id}`} className="text-sm font-bold text-[#003fb1] hover:underline">
            {leg.booking.booking_ref}
          </Link>
          <span className="text-sm font-medium text-[#191B23]">{clientName}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">
            Day {leg.day_number} of {leg.booking.total_days}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#434654]">
          <Car className="w-3.5 h-3.5 text-[#737686] shrink-0" />
          <span className="font-medium">{leg.driver.name}</span>
          <span className="text-[#737686]">· {leg.driver.vehicle_name} · {leg.driver.vehicle_number}</span>
        </div>
        {leg.booking.pickup_location && (
          <div className="flex items-center gap-1.5 text-xs text-[#737686]">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{leg.booking.pickup_location}</span>
          </div>
        )}
      </div>
      <Button
        size="sm"
        onClick={handleSend}
        disabled={sending}
        className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5 shrink-0 w-full sm:w-auto"
      >
        <Send className="w-3.5 h-3.5" />
        {sending ? 'Sending…' : `Send Day ${leg.day_number} Links`}
      </Button>
    </div>
  )
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const qc = useQueryClient()
  const { data: bookings = [], isLoading, refetch } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)

  const today    = new Date().toLocaleDateString('en-CA')
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA')

  const { data: todayLegs = [], isLoading: legsLoading } = useQuery<TodayLeg[]>({
    queryKey: ['today-links', today],
    queryFn: () => fetch(`/api/dashboard/today-links?date=${today}`).then(r => r.json()),
  })

  // ── Computed sections ────────────────────────────────────────────────────
  const inProgress          = bookings.filter(b => b.status === 'in_progress')
  const pendingApproval     = bookings.filter(b => b.status === 'pending_approval')
  const needConfirm         = bookings.filter(b => b.status === 'draft')
  const needDriver          = bookings.filter(b => b.status === 'confirmed' && !b.driver_id)
  const urgentNoDriver      = bookings.filter(b => b.status === 'confirmed' && !b.driver_id && (b.pickup_date === today || b.pickup_date === tomorrow))
  const approvalUrgent      = bookings.filter(b => b.status === 'pending_approval' && (b.pickup_date === today || b.pickup_date === tomorrow))
  const todayPickups        = bookings.filter(b => b.pickup_date === today && b.status === 'confirmed' && !!b.driver_id)
  const completedToday      = bookings.filter(b => b.status === 'completed' && b.pickup_date === today)
  const flagged             = bookings.filter(b => b.flags?.length > 0 && b.status !== 'completed' && b.status !== 'cancelled')

  // Sort by pickup date + time ascending (most urgent first)
  function byPickupAsc(a: Booking, b: Booking) {
    const ka = `${a.pickup_date ?? '9999'} ${a.pickup_time ?? '99:99'}`
    const kb = `${b.pickup_date ?? '9999'} ${b.pickup_time ?? '99:99'}`
    return ka.localeCompare(kb)
  }

  // ── Stat cards ───────────────────────────────────────────────────────────
  const cards = [
    { key: 'in_progress',     label: 'Active',          value: inProgress.length,      icon: BookOpen,      color: '#1A56DB', bg: '#DBEAFE' },
    { key: 'today_links',     label: "Today's Links",   value: todayLegs.length,        icon: Link2,         color: '#D97706', bg: '#FEF3C7' },
    { key: 'need_driver',          label: 'Need Driver',      value: needDriver.length,          icon: Car,           color: '#7E3AF2', bg: '#EDE9FE' },
    { key: 'urgent_no_driver',     label: 'No Driver Today/Tmrw', value: urgentNoDriver.length,     icon: CalendarX,     color: '#C2410C', bg: '#FFEDD5' },
    { key: 'approval_urgent',      label: 'Approval Urgent',  value: approvalUrgent.length,      icon: BellRing,      color: '#B91C1C', bg: '#FECACA' },
    { key: 'need_confirm',         label: 'Need Confirm',     value: needConfirm.length,         icon: ClipboardCheck,color: '#0E9F6E', bg: '#DEF7EC' },
    { key: 'pending_approval',     label: 'Pending Approval', value: pendingApproval.length,     icon: UserCheck,     color: '#9333EA', bg: '#F3E8FF' },
    { key: 'completed_today', label: 'Completed Today', value: completedToday.length,   icon: CheckCircle,   color: '#059669', bg: '#D1FAE5' },
    { key: 'flagged',         label: 'Flagged',         value: flagged.length,          icon: AlertTriangle, color: '#DC2626', bg: '#FEE2E2' },
  ]

  function handleCardClick(key: string) {
    setActiveSection(prev => prev === key ? null : key)
    const el = document.getElementById(`section-${key}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const shared = {
    onConfirm: async (id: string) => {
      try { await confirmBooking.mutateAsync(id); toast.success('Booking confirmed') }
      catch { toast.error('Failed to confirm booking') }
    },
    onCancel: (id: string) => setCancelTarget(id),
    onAssign: (b: Booking) => setAssignTarget(b),
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['today-links'] }) }}
              className="gap-1.5 rounded-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <ButtonLink href="/bookings/new" size="sm" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Booking</span>
            </ButtonLink>
          </div>
        }
      />

      <StatCards
        cards={cards.map(c => ({
          ...c,
          active: activeSection === c.key,
          onClick: () => handleCardClick(c.key),
        }))}
      />

      {(isLoading && legsLoading) ? (
        <div className="py-16 text-center text-[#737686] text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">

          <OpsSection id="section-today_links" title="Send Today's Driver Links" count={todayLegs.length}
            emptyText="No multi-day local trip legs for today" viewHref="/bookings" active={activeSection === 'today_links'}>
            {todayLegs.map(leg => (
              <TodayLinkCard key={leg.id} leg={leg} onSent={() => qc.invalidateQueries({ queryKey: ['today-links'] })} />
            ))}
          </OpsSection>

          <OpsSection id="section-in_progress" title="In Progress" count={inProgress.length}
            emptyText="No active trips right now" viewHref="/bookings" active={activeSection === 'in_progress'}>
            {[...inProgress].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-urgent_no_driver" title="Need Driver — Today & Tomorrow" count={urgentNoDriver.length}
            emptyText="Today's and tomorrow's confirmed bookings all have a driver" viewHref="/bookings" active={activeSection === 'urgent_no_driver'}>
            {[...urgentNoDriver].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-need_driver" title="Need Driver (All Upcoming)" count={needDriver.length}
            emptyText="All confirmed bookings have a driver assigned" viewHref="/bookings" active={activeSection === 'need_driver'}>
            {[...needDriver].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-approval_urgent" title="Approval Urgent — Today / Tomorrow" count={approvalUrgent.length}
            emptyText="No urgent pending approvals" viewHref="/bookings" active={activeSection === 'approval_urgent'}>
            {[...approvalUrgent].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-need_confirm" title="Need Confirmation" count={needConfirm.length}
            emptyText="No draft bookings waiting for confirmation" viewHref="/bookings" active={activeSection === 'need_confirm'}>
            {[...needConfirm].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-pending_approval" title="Pending Approval" count={pendingApproval.length}
            emptyText="No bookings awaiting company approval" viewHref="/bookings" active={activeSection === 'pending_approval'}>
            {[...pendingApproval].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-today_pickups" title="Today's Confirmed Pickups" count={todayPickups.length}
            emptyText="No confirmed pickups with driver today" viewHref="/bookings" active={activeSection === 'today_pickups'}>
            {[...todayPickups].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-completed_today" title="Completed Today" count={completedToday.length}
            emptyText="No trips completed today yet" viewHref="/bookings" active={activeSection === 'completed_today'}>
            {[...completedToday].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection id="section-flagged" title="Flagged" count={flagged.length}
            emptyText="No flagged bookings" viewHref="/bookings" active={activeSection === 'flagged'}>
            {[...flagged].sort(byPickupAsc).map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

        </div>
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
