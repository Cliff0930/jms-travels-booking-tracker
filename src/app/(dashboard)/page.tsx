'use client'
import { useState } from 'react'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { StatCards } from '@/components/dashboard/StatCards'
import { BookingCard } from '@/components/dashboard/BookingCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'

export default function DashboardPage() {
  const { data: bookings = [], isLoading, refetch } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()

  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  const stats = {
    active: bookings.filter(b => b.status === 'in_progress').length,
    pending: bookings.filter(b => b.status === 'pending_approval').length,
    completedToday: bookings.filter(b => b.status === 'completed').length,
    flagged: bookings.filter(b => b.flags?.length > 0).length,
  }

  const TABS = [
    { value: 'all',     label: 'All',            items: bookings },
    { value: 'draft',   label: 'Draft',          items: bookings.filter(b => b.status === 'draft') },
    { value: 'pending', label: 'Pending',         items: bookings.filter(b => b.status === 'pending_approval') },
    { value: 'confirmed', label: 'Confirmed',     items: bookings.filter(b => b.status === 'confirmed') },
    { value: 'progress', label: 'In Progress',   items: bookings.filter(b => b.status === 'in_progress') },
    { value: 'done',    label: 'Completed',       items: bookings.filter(b => b.status === 'completed') },
    { value: 'cancelled', label: 'Cancelled',    items: bookings.filter(b => b.status === 'cancelled') },
  ]

  async function handleConfirm(id: string) {
    try {
      await confirmBooking.mutateAsync(id)
      toast.success('Booking confirmed')
    } catch {
      toast.error('Failed to confirm booking')
    }
  }

  async function handleCancel(reason: string) {
    if (!cancelTarget) return
    try {
      await cancelBooking.mutateAsync({ id: cancelTarget, reason })
      toast.success('Booking cancelled')
    } catch {
      toast.error('Failed to cancel booking')
    } finally {
      setCancelTarget(null)
    }
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 rounded-sm">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <ButtonLink href="/bookings/new" size="sm" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5">
              <Plus className="w-4 h-4" /> New Booking
            </ButtonLink>
          </div>
        }
      />

      <StatCards stats={stats} />

      <Tabs defaultValue="all">
        <TabsList className="mb-4 bg-[#EDEDF8]">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:bg-white text-xs">
              {t.label}
              <span className="ml-1.5 text-[#737686]">({t.items.length})</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value}>
            {isLoading ? (
              <div className="py-12 text-center text-[#737686]">Loading bookings…</div>
            ) : t.items.length === 0 ? (
              <div className="py-12 text-center text-[#737686]">No bookings in this category</div>
            ) : (
              <div className="space-y-3">
                {t.items.map(booking => (
                  <BookingCard
                    key={booking.id}
                    booking={booking}
                    onConfirm={handleConfirm}
                    onCancel={id => setCancelTarget(id)}
                    onAssign={setAssignTarget}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={open => !open && setCancelTarget(null)}
        title="Cancel booking"
        description="Are you sure you want to cancel this booking? This action cannot be undone."
        confirmLabel="Cancel Booking"
        variant="destructive"
        onConfirm={() => handleCancel('Operator cancelled')}
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
