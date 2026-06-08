'use client'
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { tokenMatch } from '@/lib/utils/search'
import { useBookings, useConfirmBooking, useCancelBooking } from '@/hooks/useBookings'
import { useCanEdit } from '@/hooks/useCurrentUser'
import { BookingCard } from '@/components/dashboard/BookingCard'
import { LegsDueCard } from '@/components/bookings/LegsDueCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Upload, CalendarDays, Building2, X, Search, RefreshCw, User, Link2, ArrowUpDown, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'

function localDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
}

function get60DaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return d.toISOString().slice(0, 10) + 'T00:00:00'
}

export default function BookingsPage() {
  const [showAll, setShowAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // When searching, remove the 60-day window so search covers all history
  const createdFrom = (showAll || searchQuery.trim()) ? undefined : get60DaysAgo()
  const { data: bookings = [], isLoading, isError, refetch } = useBookings({ createdFrom })

  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const canEdit = useCanEdit()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<Booking | null>(null)

  // Filters
  const [activeTab,        setActiveTab]        = useState('all')
  const [noDriverFilter,   setNoDriverFilter]   = useState(false)
  const [flaggedFilter,    setFlaggedFilter]    = useState(false)
  const [pickupDate,       setPickupDate]       = useState<string>('')   // 'today' | 'tomorrow' | 'YYYY-MM-DD' | ''
  const [newTodayOnly,     setNewTodayOnly]     = useState(false)
  const [companyFilter,    setCompanyFilter]    = useState<string>('')
  const [bookingTypeFilter, setBookingTypeFilter] = useState<'' | 'company' | 'personal'>('')
  const [legsFilter,       setLegsFilter]       = useState<'' | 'today_legs' | 'tomorrow_legs'>('')
  const [sortByDate,       setSortByDate]       = useState(false)

  // Initialise from URL params after mount (deep-link support from dashboard)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const tab    = p.get('tab')
    const filter = p.get('filter')
    if (tab) setActiveTab(tab)
    if (filter === 'no_driver') setNoDriverFilter(true)
    if (filter === 'flagged')   setFlaggedFilter(true)
  }, [])

  const today = localDate(0)
  const tomorrow = localDate(1)

  const legsDate = legsFilter === 'today_legs' ? today : legsFilter === 'tomorrow_legs' ? tomorrow : null
  const { data: legsDue = [], isLoading: legsLoading } = useQuery<{ leg: any; booking: any }[]>({
    queryKey: ['legs-due', legsDate],
    queryFn: () => fetch(`/api/bookings/legs-due?date=${legsDate}`).then(r => r.json()),
    enabled: !!legsDate,
    refetchInterval: 30000,
  })

  const companies = useMemo(() => {
    const names = bookings
      .map(b => b.company?.name || b.client?.company?.name)
      .filter(Boolean) as string[]
    return [...new Set(names)].sort()
  }, [bookings])

  const hasFilters = !!searchQuery || !!pickupDate || newTodayOnly || !!companyFilter || !!bookingTypeFilter || !!legsFilter || noDriverFilter || flaggedFilter

  function clearFilters() {
    setSearchQuery('')
    setPickupDate('')
    setNewTodayOnly(false)
    setCompanyFilter('')
    setBookingTypeFilter('')
    setLegsFilter('')
    setNoDriverFilter(false)
    setFlaggedFilter(false)
  }

  function applyFilters(items: Booking[]) {
    return items.filter(b => {
      if (pickupDate === 'today' && !b.pickup_date?.startsWith(today)) return false
      if (pickupDate === 'tomorrow' && !b.pickup_date?.startsWith(tomorrow)) return false
      if (pickupDate !== 'today' && pickupDate !== 'tomorrow' && pickupDate && !b.pickup_date?.startsWith(pickupDate)) return false
      if (newTodayOnly && !b.created_at?.startsWith(today)) return false
      const derivedCompany = b.company?.name || b.client?.company?.name
      if (companyFilter && derivedCompany !== companyFilter) return false
      if (bookingTypeFilter && b.booking_type !== bookingTypeFilter) return false
      if (noDriverFilter && b.driver_id !== null) return false
      if (flaggedFilter && (b.flags?.length ?? 0) === 0) return false
      if (searchQuery) {
        const match = tokenMatch(searchQuery,
          b.booking_ref, b.guest_name, b.guest_phone,
          b.client?.name, b.client?.primary_phone, b.client?.primary_email,
          b.company?.name, b.client?.company?.name,
          b.driver?.name, b.driver?.phone, b.driver?.vehicle_number,
          b.pickup_location, b.drop_location
        )
        if (!match) return false
      }
      return true
    })
  }

  function sortByPickup(items: Booking[]) {
    return [...items].sort((a, b) => {
      const aDate = a.pickup_date || ''
      const bDate = b.pickup_date || ''
      const aPast = aDate && aDate < today
      const bPast = bDate && bDate < today
      if (aPast && !bPast) return 1   // past trips sink to bottom
      if (!aPast && bPast) return -1
      const aStr = (aDate || '9999-99-99') + 'T' + (a.pickup_time || '99:99')
      const bStr = (bDate || '9999-99-99') + 'T' + (b.pickup_time || '99:99')
      return aStr.localeCompare(bStr)
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
            <Button
              variant="outline" size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5 rounded-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            {canEdit && (
              <>
                <ButtonLink href="/bookings/upload" size="sm" variant="outline" className="rounded-sm gap-1.5">
                  <Upload className="w-4 h-4" /> Upload
                </ButtonLink>
                <ButtonLink href="/bookings/offline-trip" size="sm" variant="outline" className="rounded-sm gap-1.5 text-[#7E3AF2] border-[#C4B5FD] hover:bg-[#EDE9FE]">
                  <FileText className="w-4 h-4" /> Offline Trip
                </ButtonLink>
                <ButtonLink href="/bookings/new" size="sm" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5">
                  <Plus className="w-4 h-4" /> New Booking
                </ButtonLink>
              </>
            )}
          </div>
        }
      />

      {/* Date window banner */}
      {!showAll && !searchQuery.trim() && (
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span>Showing last 60 days. Search automatically includes all history.</span>
          <button onClick={() => setShowAll(true)} className="text-blue-600 hover:text-blue-800 font-semibold underline-offset-2 hover:underline">
            Show all time →
          </button>
        </div>
      )}
      {(showAll || searchQuery.trim()) && (
        <div className="mb-2 flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <span>{searchQuery.trim() ? 'Searching all bookings.' : 'Showing all bookings.'}</span>
          {!searchQuery.trim() && (
            <button onClick={() => setShowAll(false)} className="text-gray-500 hover:text-gray-700 font-semibold underline-offset-2 hover:underline">
              Back to last 60 days
            </button>
          )}
        </div>
      )}

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

        {/* Billing type filter */}
        <div className="flex items-center rounded-md border border-[#C3C5D7] overflow-hidden shrink-0">
          <button
            onClick={() => setBookingTypeFilter(v => v === 'company' ? '' : 'company')}
            className={`px-3.5 h-8 text-xs font-medium border-r border-[#C3C5D7] transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              bookingTypeFilter === 'company'
                ? 'bg-[#1D4ED8] text-white border-r-[#1D4ED8]'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Corporate
          </button>
          <button
            onClick={() => setBookingTypeFilter(v => v === 'personal' ? '' : 'personal')}
            className={`px-3.5 h-8 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              bookingTypeFilter === 'personal'
                ? 'bg-[#C2410C] text-white'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            <User className="w-3.5 h-3.5" /> Personal
          </button>
        </div>

        {/* Vertical divider — desktop only */}
        <div className="hidden sm:block h-6 w-px bg-[#E5E7EB]" />

        {/* Driver Links filter */}
        <div className="flex items-center rounded-md border border-[#C3C5D7] overflow-hidden shrink-0">
          <button
            onClick={() => setLegsFilter(v => v === 'today_legs' ? '' : 'today_legs')}
            className={`px-3.5 h-8 text-xs font-medium border-r border-[#C3C5D7] transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              legsFilter === 'today_legs'
                ? 'bg-[#059669] text-white border-r-[#059669]'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" /> Today's Legs
          </button>
          <button
            onClick={() => setLegsFilter(v => v === 'tomorrow_legs' ? '' : 'tomorrow_legs')}
            className={`px-3.5 h-8 text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              legsFilter === 'tomorrow_legs'
                ? 'bg-[#059669] text-white'
                : 'bg-white text-[#434654] hover:bg-[#F5F6FA]'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" /> Tomorrow's Legs
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

        {/* Sort by nearest travel date */}
        <button
          onClick={() => setSortByDate(v => !v)}
          className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${
            sortByDate
              ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
              : 'bg-white text-[#6B7280] border-[#C3C5D7] hover:border-[#9CA3AF]'
          }`}
          title="Sort by nearest travel date & time"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Date ↑
        </button>

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

      {/* Legs Due section */}
      {legsFilter && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="w-4 h-4 text-[#059669]" />
            <h2 className="text-sm font-semibold text-[#191B23]">
              {legsFilter === 'today_legs' ? "Today's" : "Tomorrow's"} Legs — Driver Links
            </h2>
            {!legsLoading && (
              <span className="text-xs text-[#737686]">
                {legsDue.length} leg{legsDue.length !== 1 ? 's' : ''}
                {legsDue.filter((i: any) => !i.leg.link_sent_at).length > 0 && (
                  <span className="ml-1 text-amber-600 font-medium">
                    · {legsDue.filter((i: any) => !i.leg.link_sent_at).length} need links
                  </span>
                )}
              </span>
            )}
          </div>
          {legsLoading ? (
            <div className="py-8 text-center text-[#737686] text-sm">Loading legs…</div>
          ) : legsDue.length === 0 ? (
            <div className="py-8 text-center text-[#737686] text-sm">
              No multi-day legs scheduled for {legsFilter === 'today_legs' ? 'today' : 'tomorrow'}.
            </div>
          ) : (
            <div className="space-y-2">
              {legsDue.map((item: any) => (
                <LegsDueCard key={`${item.booking.id}-${item.leg.id}`} item={item} legsDate={legsDate!} />
              ))}
            </div>
          )}
        </div>
      )}

      {(noDriverFilter || flaggedFilter) && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          {noDriverFilter && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
              No driver assigned
              <button onClick={() => setNoDriverFilter(false)} className="ml-0.5 hover:text-amber-600"><X className="w-3 h-3" /></button>
            </span>
          )}
          {flaggedFilter && (
            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-medium">
              Flagged only
              <button onClick={() => setFlaggedFilter(false)} className="ml-0.5 hover:text-red-600"><X className="w-3 h-3" /></button>
            </span>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 bg-[#EDEDF8] flex-wrap h-auto gap-0.5">
          {TABS.map(t => {
            const count = (sortByDate ? sortByPickup(applyFilters(t.items)) : applyFilters(t.items)).length
            return (
              <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:bg-white text-xs">
                {t.label} <span className="ml-1 text-[#737686]">({count})</span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {TABS.map(t => {
          const filtered = sortByDate ? sortByPickup(applyFilters(t.items)) : applyFilters(t.items)
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
                      onConfirm={canEdit ? async id => { await confirmBooking.mutateAsync({ id }); toast.success('Confirmed') } : undefined}
                      onCancel={canEdit ? id => setCancelTarget(id) : undefined}
                      onAssign={canEdit ? setAssignTarget : undefined}
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
