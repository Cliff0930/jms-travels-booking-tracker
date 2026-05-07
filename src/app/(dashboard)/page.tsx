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
import { Plus, RefreshCw, ArrowRight, Send, Car, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
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

function OpsSection({
  title,
  count,
  emptyText,
  viewHref,
  children,
}: {
  title: string
  count: number
  emptyText: string
  viewHref: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[#737686]">{title}</h2>
          {count > 0 && (
            <span className="text-[11px] font-semibold bg-[#EDEDF8] text-[#434654] px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        <ButtonLink
          href={viewHref}
          variant="ghost"
          size="sm"
          className="text-xs text-[#1A56DB] gap-1 h-7 px-2"
        >
          View all <ArrowRight className="w-3 h-3" />
        </ButtonLink>
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
      {/* Day badge */}
      <div className="w-10 h-10 rounded-full bg-[#003fb1] flex items-center justify-center text-white text-sm font-bold shrink-0">
        D{leg.day_number}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/bookings/${leg.booking_id}`}
            className="text-sm font-bold text-[#003fb1] hover:underline"
          >
            {leg.booking.booking_ref}
          </Link>
          <span className="text-xs text-[#737686]">·</span>
          <span className="text-sm font-medium text-[#191B23]">{clientName}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">
            Day {leg.day_number} of {leg.booking.total_days}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#434654]">
          <Car className="w-3.5 h-3.5 text-[#737686] shrink-0" />
          <span className="font-medium">{leg.driver.name}</span>
          <span className="text-[#737686]">·</span>
          <span className="text-[#737686]">{leg.driver.vehicle_name} · {leg.driver.vehicle_number}</span>
        </div>
        {leg.booking.pickup_location && (
          <div className="flex items-center gap-1.5 text-xs text-[#737686]">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{leg.booking.pickup_location}</span>
          </div>
        )}
      </div>

      {/* Send button */}
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

export default function DashboardPage() {
  const qc = useQueryClient()
  const { data: bookings = [], isLoading, refetch } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  const today = new Date().toLocaleDateString('en-CA')

  const { data: todayLegs = [], isLoading: legsLoading } = useQuery<TodayLeg[]>({
    queryKey: ['today-links', today],
    queryFn: () => fetch(`/api/dashboard/today-links?date=${today}`).then(r => r.json()),
  })

  const stats = {
    active: bookings.filter(b => b.status === 'in_progress').length,
    pending: bookings.filter(b => b.status === 'pending_approval').length,
    completedToday: bookings.filter(b => b.status === 'completed' && b.pickup_date === today).length,
    flagged: bookings.filter(b => b.flags?.length > 0).length,
  }

  const inProgress = bookings.filter(b => b.status === 'in_progress')
  const needsAction = bookings.filter(b => b.status === 'pending_approval' || b.status === 'draft')
  const todayTrips = bookings.filter(b => b.pickup_date === today && b.status === 'confirmed')

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
              variant="outline"
              size="sm"
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

      <StatCards stats={stats} />

      {/* Today's multi-day driver links — shown even while bookings load */}
      {!legsLoading && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#737686]">
              Send Today&apos;s Driver Links
            </h2>
            {todayLegs.length > 0 && (
              <span className="text-[11px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                {todayLegs.length} pending
              </span>
            )}
          </div>
          {todayLegs.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-6 text-center text-sm text-[#9CA3AF]">
              No multi-day local trips with legs scheduled for today
            </div>
          ) : (
            <div className="space-y-3">
              {todayLegs.map(leg => (
                <TodayLinkCard
                  key={leg.id}
                  leg={leg}
                  onSent={() => qc.invalidateQueries({ queryKey: ['today-links'] })}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-[#737686] text-sm">Loading…</div>
      ) : (
        <div className="space-y-6">
          {inProgress.length > 0 && (
            <OpsSection
              title="In Progress"
              count={inProgress.length}
              emptyText=""
              viewHref="/bookings"
            >
              {inProgress.map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
            </OpsSection>
          )}

          <OpsSection
            title="Needs Action"
            count={needsAction.length}
            emptyText="No pending approvals or drafts"
            viewHref="/bookings"
          >
            {needsAction.map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
          </OpsSection>

          <OpsSection
            title="Today's Confirmed Pickups"
            count={todayTrips.length}
            emptyText="No confirmed pickups today"
            viewHref="/bookings"
          >
            {todayTrips.map(b => <BookingCard key={b.id} booking={b} {...shared} />)}
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
        <AssignDriverModal
          booking={assignTarget}
          open={!!assignTarget}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  )
}
