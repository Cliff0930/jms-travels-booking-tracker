'use client'
import { useState } from 'react'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { StatCards } from '@/components/dashboard/StatCards'
import { BookingCard } from '@/components/dashboard/BookingCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { Plus, RefreshCw, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'

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

export default function DashboardPage() {
  const { data: bookings = [], isLoading, refetch } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  const today = new Date().toLocaleDateString('en-CA')

  const stats = {
    active: bookings.filter(b => b.status === 'in_progress').length,
    pending: bookings.filter(b => b.status === 'pending_approval').length,
    completedToday: bookings.filter(b => b.status === 'completed' && b.pickup_date === today).length,
    flagged: bookings.filter(b => b.flags?.length > 0).length,
  }

  const inProgress = bookings.filter(b => b.status === 'in_progress')
  const needsAction = bookings.filter(b => b.status === 'pending_approval' || b.status === 'draft')
  const todayTrips = bookings.filter(
    b => b.pickup_date === today && b.status === 'confirmed'
  )

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
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 rounded-sm">
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
