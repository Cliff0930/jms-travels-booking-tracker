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
import { Plus, Upload, CalendarDays, Building2, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'

function localDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
}

export default function BookingsPage() {
  const { data: bookings = [], isLoading, isError } = useBookings()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pickupDate, setPickupDate] = useState<string>('')   // 'today' | 'tomorrow' | 'YYYY-MM-DD' | ''
  const [newTodayOnly, setNewTodayOnly] = useState(false)
  const [companyFilter, setCompanyFilter] = useState<string>('')

  const today = localDate(0)
  const tomorrow = localDate(1)

  const companies = useMemo(() => {
    const names = bookings.map(b => b.company?.name).filter(Boolean) as string[]
    return [...new Set(names)].sort()
  }, [bookings])

  const hasFilters = !!searchQuery || !!pickupDate || newTodayOnly || !!companyFilter

  function clearFilters() {
    setSearchQuery('')
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
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match =
          b.booking_ref?.toLowerCase().includes(q) ||
          b.guest_name?.toLowerCase().includes(q) ||
          b.guest_phone?.toLowerCase().includes(q) ||
          b.client?.name?.toLowerCase().includes(q) ||
          b.client?.primary_phone?.toLowerCase().includes(q) ||
          b.client?.primary_email?.toLowerCase().includes(q) ||
          b.company?.name?.toLowerCase().includes(q) ||
          b.driver?.name?.toLowerCase().includes(q) ||
          b.driver?.phone?.toLowerCase().includes(q) ||
          b.driver?.vehicle_number?.toLowerCase().includes(q) ||
          b.pickup_location?.toLowerCase().includes(q) ||
          b.drop_location?.toLowerCase().includes(q)
        if (!match) return false
      }
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
      <div className="mb-4 bg-white rounded-lg border border-[#E5E7EB] p-3 flex flex-wrap items-center gap-2.5">
        {/* Search input */}
        <div className="relative flex items-center w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 w-3.5 h-3.5 text-[#9CA3AF] z-10" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search bookings…"
            className={`w-full h-8 pl-8 pr-8 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#1A56DB] focus:border-[#1A56DB] transition-colors ${
              searchQuery
                ? 'border-[#1A56DB] text-[#191B23]'
                : 'border-[#C3C5D7] text-[#6B7280] placeholder:text-[#9CA3AF] hover:border-[#9CA3AF]'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-[#9CA3AF] hover:text-[#434654] transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Vertical divider — desktop only */}
        <div className="hidden sm:block h-6 w-px bg-[#E5E7EB]" />

        {/* Quick date button group — segmented control */}
        <div className="flex items-center rounded-md border border-[#C3C5D7] overflow-hidden shrink-0">
          <button
            onClick={() => setPickupDate(v => v === 'today' ? '' : 'today')}
            className={`px-3.5 h-8 text-xs font-medium border-r border-[#C3C5D7] transition-colors whitespace-nowrap ${
              pickupDate === 'today'
                ? 'bg-[#1A56DB] text-white border-r-[#1A56DB]'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setPickupDate(v => v === 'tomorrow' ? '' : 'tomorrow')}
            className={`px-3.5 h-8 text-xs font-medium border-r border-[#C3C5D7] transition-colors whitespace-nowrap ${
              pickupDate === 'tomorrow'
                ? 'bg-[#1A56DB] text-white border-r-[#1A56DB]'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            Tomorrow
          </button>
          <button
            onClick={() => setNewTodayOnly(v => !v)}
            className={`px-3.5 h-8 text-xs font-medium transition-colors whitespace-nowrap ${
              newTodayOnly
                ? 'bg-[#7E3AF2] text-white'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            New Today
          </button>
        </div>

        {/* Vertical divider — desktop only */}
        <div className="hidden sm:block h-6 w-px bg-[#E5E7EB]" />

        {/* Custom Date Picker */}
        <div className="relative inline-flex items-center">
          <CalendarDays className="pointer-events-none absolute left-2.5 w-3.5 h-3.5 text-[#9CA3AF] z-10" />
          <input
            type="date"
            value={customDateValue}
            onChange={e => setPickupDate(e.target.value || '')}
            className={`h-8 pl-8 pr-3 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#1A56DB] focus:border-[#1A56DB] cursor-pointer transition-colors ${
              customDateValue
                ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EBF5FF]'
                : 'border-[#C3C5D7] text-[#6B7280] hover:border-[#9CA3AF]'
            }`}
          />
        </div>

        {/* Company Filter */}
        {companies.length > 0 && (
          <Select
            value={companyFilter || '__all__'}
            onValueChange={v => { if (v !== null) setCompanyFilter(v === '__all__' ? '' : v) }}
          >
            <SelectTrigger className={`h-8 rounded-md text-xs px-3 gap-1.5 min-w-[150px] transition-colors ${
              companyFilter
                ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EBF5FF]'
                : 'border-[#C3C5D7] bg-white text-[#6B7280] hover:border-[#9CA3AF]'
            }`}>
              <Building2 className="w-3.5 h-3.5 shrink-0" />
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

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto flex items-center gap-1.5 px-3 h-8 rounded-md text-xs text-[#6B7280] hover:text-[#191B23] border border-[#C3C5D7] hover:border-[#9CA3AF] bg-white transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
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
              ) : isError ? (
                <div className="py-12 text-center text-[#737686] text-sm">Unable to load bookings. Please refresh the page.</div>
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
