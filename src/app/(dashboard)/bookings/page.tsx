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
import { Plus, Upload, CalendarDays, Building2, X, Search, RefreshCw, User, Link2, ArrowUpDown, FileText, LayoutList, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking } from '@/types'
import { BookingListRow } from '@/components/dashboard/BookingListRow'

// Tab status dot colors
const TAB_DOT: Record<string, string> = {
  all:              'bg-[#9CA3AF]',
  draft:            'bg-[#6B7280]',
  pending_approval: 'bg-amber-400',
  confirmed:        'bg-[#1A56DB]',
  in_progress:      'bg-[#059669]',
  completed:        'bg-emerald-400',
  cancelled:        'bg-red-400',
}

const EMPTY_STATE: Record<string, string> = {
  all:              'No bookings yet',
  draft:            'No unconfirmed drafts',
  pending_approval: 'All approvals are processed',
  confirmed:        'No confirmed trips',
  in_progress:      'No trips running right now',
  completed:        'No completed trips',
  cancelled:        'No cancelled bookings',
}

const EMPTY_EMOJI: Record<string, string> = {
  all:              '📋',
  draft:            '✏️',
  pending_approval: '✅',
  confirmed:        '🗓️',
  in_progress:      '🚗',
  completed:        '🏁',
  cancelled:        '🚫',
}

const PILL_COLORS: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-700 border-blue-200',
  purple: 'bg-purple-50 text-purple-700 border-purple-200',
  orange: 'bg-orange-50 text-orange-700 border-orange-200',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:  'bg-amber-50 text-amber-700 border-amber-200',
  red:    'bg-red-50 text-red-700 border-red-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  grey:   'bg-gray-100 text-gray-700 border-gray-200',
}

function FilterPill({ label, color, onRemove }: { label: string; color: string; onRemove: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${PILL_COLORS[color] ?? PILL_COLORS.grey}`}>
      {label}
      <button onClick={onRemove} className="opacity-60 hover:opacity-100 transition-opacity">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

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
  const [viewMode,         setViewMode]         = useState<'card' | 'list'>('card')

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
      <div className="mb-4 bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-2.5">
        {/* Row 1: Search + View Toggle (always visible) */}
        <div className="flex items-center gap-2">
          <div className="relative flex items-center flex-1 sm:flex-none sm:w-64">
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
          <div className="flex items-center gap-2 ml-auto">
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="sm:hidden flex items-center justify-center h-8 w-8 rounded-md text-[#6B7280] border border-[#C3C5D7] bg-white"
                title="Clear all filters"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setViewMode(v => v === 'card' ? 'list' : 'card')}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
                  : 'bg-white text-[#6B7280] border-[#C3C5D7] hover:border-[#9CA3AF]'
              }`}
              title={viewMode === 'card' ? 'Switch to list view' : 'Switch to card view'}
            >
              {viewMode === 'card' ? <LayoutList className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{viewMode === 'card' ? 'List' : 'Cards'}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Filter controls — swipe-scrollable on mobile, wrap on desktop */}
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5">
          <div className="flex items-center gap-2 min-w-max sm:min-w-0 sm:flex-wrap">
            {/* Quick date button group */}
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

            <div className="hidden sm:block h-6 w-px bg-[#E5E7EB]" />

            {/* Custom Date Picker */}
            <div className="relative inline-flex items-center shrink-0">
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
              className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border transition-colors shrink-0 ${
                sortByDate
                  ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
                  : 'bg-white text-[#6B7280] border-[#C3C5D7] hover:border-[#9CA3AF]'
              }`}
              title="Sort by nearest travel date & time"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Date ↑
            </button>

            {/* Desktop: clear filters */}
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="hidden sm:flex items-center gap-1.5 px-3 h-8 rounded-md text-xs text-[#6B7280] hover:text-[#191B23] border border-[#C3C5D7] hover:border-[#9CA3AF] bg-white transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" /> Clear filters
              </button>
            )}
          </div>
        </div>
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

      {hasFilters && (
        <div className="mb-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-[#9CA3AF] font-medium shrink-0">Filters:</span>
          {pickupDate === 'today'    && <FilterPill label="Today"         color="blue"   onRemove={() => setPickupDate('')} />}
          {pickupDate === 'tomorrow' && <FilterPill label="Tomorrow"      color="blue"   onRemove={() => setPickupDate('')} />}
          {customDateValue          && <FilterPill label={`Date: ${customDateValue}`} color="blue" onRemove={() => setPickupDate('')} />}
          {newTodayOnly             && <FilterPill label="New Today"      color="purple" onRemove={() => setNewTodayOnly(false)} />}
          {bookingTypeFilter === 'company'  && <FilterPill label="Corporate"       color="blue"   onRemove={() => setBookingTypeFilter('')} />}
          {bookingTypeFilter === 'personal' && <FilterPill label="Personal"        color="orange" onRemove={() => setBookingTypeFilter('')} />}
          {legsFilter === 'today_legs'      && <FilterPill label="Today's Legs"    color="green"  onRemove={() => setLegsFilter('')} />}
          {legsFilter === 'tomorrow_legs'   && <FilterPill label="Tomorrow's Legs" color="green"  onRemove={() => setLegsFilter('')} />}
          {companyFilter  && <FilterPill label={companyFilter} color="indigo" onRemove={() => setCompanyFilter('')} />}
          {noDriverFilter && <FilterPill label="No Driver"    color="amber"  onRemove={() => setNoDriverFilter(false)} />}
          {flaggedFilter  && <FilterPill label="Flagged"      color="red"    onRemove={() => setFlaggedFilter(false)} />}
          {searchQuery    && <FilterPill label={`"${searchQuery}"`} color="grey" onRemove={() => setSearchQuery('')} />}
          <button onClick={clearFilters} className="text-[11px] text-[#9CA3AF] hover:text-red-500 font-medium transition-colors">Clear all</button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 bg-[#EDEDF8] flex-wrap h-auto gap-0.5">
          {TABS.map(t => {
            const count = (sortByDate ? sortByPickup(applyFilters(t.items)) : applyFilters(t.items)).length
            return (
              <TabsTrigger key={t.value} value={t.value} className="data-[state=active]:bg-white text-xs gap-1.5">
                <span className={`inline-flex h-1.5 w-1.5 rounded-full shrink-0 ${TAB_DOT[t.value] ?? 'bg-gray-400'} ${t.value === 'in_progress' && count > 0 ? 'animate-pulse' : ''}`} />
                {t.label}
                <span className={count === 0 ? 'text-[#C3C5D7]' : 'text-[#737686]'}>({count})</span>
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
                <div className="py-16 text-center">
                  <div className="text-3xl mb-2">{EMPTY_EMOJI[t.value] ?? '📋'}</div>
                  <p className="text-sm font-medium text-[#434654]">
                    {hasFilters ? 'No bookings match the current filters' : EMPTY_STATE[t.value] ?? 'No bookings'}
                  </p>
                  {hasFilters && (
                    <button onClick={clearFilters} className="mt-1.5 text-xs text-[#1A56DB] hover:underline">Clear filters</button>
                  )}
                </div>
              ) : viewMode === 'list' ? (
                <div className="rounded-xl border border-[#E5E7EB] overflow-hidden bg-white">
                  <div className="hidden md:grid grid-cols-[160px_1fr_1fr_140px_120px_110px_40px] gap-3 px-4 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB] text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    <span>Ref</span><span>Traveller</span><span>Route</span><span>Date / Time</span><span>Driver</span><span>Status</span><span />
                  </div>
                  {filtered.map(b => (
                    <BookingListRow
                      key={b.id}
                      booking={b}
                      onConfirm={canEdit ? async id => { await confirmBooking.mutateAsync({ id }); toast.success('Confirmed') } : undefined}
                      onCancel={canEdit ? id => setCancelTarget(id) : undefined}
                      onAssign={canEdit ? setAssignTarget : undefined}
                    />
                  ))}
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
