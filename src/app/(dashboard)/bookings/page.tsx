'use client'
import { useState } from 'react'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { BookingCard } from '@/components/dashboard/BookingCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'

export default function BookingsPage() {
  const { data: bookings = [], isLoading } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  const TABS = [
    { value: 'all',       label: 'All',          items: bookings },
    { value: 'draft',     label: 'Draft',        items: bookings.filter(b => b.status === 'draft') },
    { value: 'pending_approval', label: 'Pending', items: bookings.filter(b => b.status === 'pending_approval') },
    { value: 'confirmed', label: 'Confirmed',    items: bookings.filter(b => b.status === 'confirmed') },
    { value: 'in_progress', label: 'In Progress', items: bookings.filter(b => b.status === 'in_progress') },
    { value: 'completed', label: 'Completed',    items: bookings.filter(b => b.status === 'completed') },
    { value: 'cancelled', label: 'Cancelled',    items: bookings.filter(b => b.status === 'cancelled') },
  ]

  return (
    <div>
      <PageHeader
        title="Bookings"
        actions={
          <div className="flex items-center gap-2">
            <ButtonLink href="/bookings/upload" size="sm" variant="outline" className="rounded-sm gap-1.5">
              <Upload className="w-4 h-4" /> Upload
            </ButtonLink>
            <ButtonLink href="/bookings/new" size="sm" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5">
              <Plus className="w-4 h-4" /> New Booking
            </ButtonLink>
          </div>
        }
      />

      <Tabs defaultValue="all">
        <TabsList className="mb-4 bg-[#EDEDF8] flex-wrap h-auto gap-0.5">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:bg-white text-xs">
              {t.label} <span className="ml-1 text-[#737686]">({t.items.length})</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value}>
            {isLoading ? (
              <div className="py-12 text-center text-[#737686]">Loading…</div>
            ) : t.items.length === 0 ? (
              <div className="py-12 text-center text-[#737686]">No bookings</div>
            ) : (
              <div className="space-y-3">
                {t.items.map(b => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onConfirm={async id => { await confirmBooking.mutateAsync(id); toast.success('Confirmed') }}
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
        onOpenChange={o => !o && setCancelTarget(null)}
        title="Cancel booking"
        description="Are you sure you want to cancel this booking?"
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
