'use client'
import { useState, useMemo } from 'react'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { BookingCard } from '@/components/dashboard/BookingCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Upload, CalendarDays, Building2, X, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'

function localDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
}

export default function BookingsPage() {
  const { data: bookings = [], isLoading } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  // Filters
  const [pickupDate, setPickupDate] = useState<string>('')   // 'today' | 'tomorrow' | 'YYYY-MM-DD' | ''
  const [newTodayOnly, setNewTodayOnly] = useState(false)
  const [companyFilter, setCompanyFilter] = useState<string>('')

  const today = localDate(0)
  const tomorrow = localDate(1)

  const companies = useMemo(() => {
    const names = bookings.map(b => b.company?.name).filter(Boolean) as string[]
    return [...new Set(names)].sort()
  }, [bookings])

  const hasFilters = !!pickupDate || newTodayOnly || !!companyFilter

  function clearFilters() {
    setPickupDate('')
    setNewTodayOnly(false)
    setCompanyFilter('')
  }

  function applyFilters(items: Booking[]) {
    return items.filter(b => {
      if (pickupDate === 'today' && !b.pickup_date?.startsWith(today)) return false
      if (pickupDate === 'tomorrow' && !b.pickup_date?.startsWith(tomorrow)) return false
      if (pickupDate !== 'today' && pickupDate !== 'tomorrow' && pickupDate && !b.pickup_date?.startsWith(pickupDate)) return false
      if (newTodayOnly && !b.created_at?.startsWith(today)) return false
      if (companyFilter && b.company?.name !== companyFilter) return false
      return true
    })
  }

  const customDateValue = pickupDate !== 'today' && pickupDate !== 'tomorrow' ? pickupDate : ''

  const TABS = [
    { value: 'all',              label: 'All',         items: bookings },
    { value: 'draft',            label: 'Draft',       items: bookings.filter(b => b.status === 'draft') },
    { value: 'pending_approval', label: 'Pending',     items: bookings.filter(b => b.status === 'pending_approval') },
    { value: 'confirmed',        label: 'Confirmed',   items: bookings.filter(b => b.status === 'confirmed') },
    { value: 'in_progress',      label: 'In Progress', items: bookings.filter(b => b.status === 'in_progress') },
    { value: 'completed',        label: 'Completed',   items: bookings.filter(b => b.status === 'completed') },
    { value: 'cancelled',        label: 'Cancelled',   items: bookings.filter(b => b.status === 'cancelled') },
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

      {/* Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Today's Trips */}
        <button
          onClick={() => setPickupDate(v => v === 'today' ? '' : 'today')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            pickupDate === 'today'
              ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
              : 'bg-white text-[#434654] border-[#C3C5D7] hover:border-[#1A56DB] hover:text-[#1A56DB]'
          }`}
        >
          <CalendarDays className="w-3 h-3" /> Today&apos;s Trips
        </button>

        {/* Tomorrow's Trips */}
        <button
          onClick={() => setPickupDate(v => v === 'tomorrow' ? '' : 'tomorrow')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            pickupDate === 'tomorrow'
              ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
              : 'bg-white text-[#434654] border-[#C3C5D7] hover:border-[#1A56DB] hover:text-[#1A56DB]'
          }`}
        >
          <CalendarDays className="w-3 h-3" /> Tomorrow&apos;s Trips
        </button>

        {/* New Today (bookings received today) */}
        <button
          onClick={() => setNewTodayOnly(v => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            newTodayOnly
              ? 'bg-[#7E3AF2] text-white border-[#7E3AF2]'
              : 'bg-white text-[#434654] border-[#C3C5D7] hover:border-[#7E3AF2] hover:text-[#7E3AF2]'
          }`}
        >
          <Sparkles className="w-3 h-3" /> New Today
        </button>

        {/* Custom Date Picker */}
        <div className="relative inline-flex items-center">
          <CalendarDays className="pointer-events-none absolute left-2.5 w-3 h-3 text-[#737686] z-10" />
          <input
            type="date"
            value={customDateValue}
            onChange={e => setPickupDate(e.target.value || '')}
            placeholder="Pick date"
            className={`h-7 pl-7 pr-2.5 text-xs border rounded-full bg-white focus:outline-none focus:border-[#1A56DB] cursor-pointer transition-colors ${
              customDateValue
                ? 'border-[#1A56DB] text-[#1A56DB]'
                : 'border-[#C3C5D7] text-[#434654]'
            }`}
          />
        </div>

        {/* Company Filter */}
        {companies.length > 0 && (
          <Select
            value={companyFilter || '__all__'}
            onValueChange={v => setCompanyFilter(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className={`h-7 rounded-full text-xs px-3 gap-1.5 min-w-[140px] transition-colors ${
              companyFilter
                ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EBF0FF]'
                : 'border-[#C3C5D7] bg-white text-[#434654]'
            }`}>
              <Building2 className="w-3 h-3 shrink-0" />
              <SelectValue placeholder="All Companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Companies</SelectItem>
              {companies.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear All */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-[#737686] hover:text-[#191B23] border border-[#C3C5D7] hover:border-[#737686] bg-white transition-colors"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <Tabs defaultValue="all">
        <TabsList className="mb-4 bg-[#EDEDF8] flex-wrap h-auto gap-0.5">
          {TABS.map(t => {
            const count = applyFilters(t.items).length
            return (
              <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:bg-white text-xs">
                {t.label} <span className="ml-1 text-[#737686]">({count})</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {TABS.map(t => {
          const filtered = applyFilters(t.items)
          return (
            <TabsContent key={t.value} value={t.value}>
              {isLoading ? (
                <div className="py-12 text-center text-[#737686]">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-[#737686]">
                  {hasFilters ? (
                    <span>No bookings match the current filters. <button onClick={clearFilters} className="text-[#1A56DB] hover:underline">Clear filters</button></span>
                  ) : (
                    'No bookings'
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map(b => (
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
          )
        })}
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
