'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { Download, Search, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { Booking } from '@/types'

const ReportsCharts = dynamic(() => import('./ReportsCharts'), { ssr: false })

// Extended type with tripsheet data
interface TripSheetRow {
  tripsheet_number: string | null
  opening_km: number | null
  closing_km: number | null
  opening_time: string | null
  closing_time: string | null
  manual_opening_time: string | null
  manual_closing_time: string | null
  office_to_pickup_km: number | null
  drop_to_office_km: number | null
  toll_amount: number | null
  parking_amount: number | null
  permit_amount: number | null
  bata_driver: number | null
  gps_km: number | null
}

interface BookingWithSheet extends Booking {
  trip_sheet: TripSheetRow | null
  driver?: Booking['driver'] & { vehicle_color?: string; secondary_phone?: string }
}

function quickRange(preset: string): { date_from: string; date_to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)
  if (preset === 'today')      return { date_from: today, date_to: today }
  if (preset === 'week')       { const d = new Date(now); d.setDate(d.getDate() - 6); return { date_from: fmt(d), date_to: today } }
  if (preset === 'month')      { const d = new Date(now); d.setDate(d.getDate() - 29); return { date_from: fmt(d), date_to: today } }
  if (preset === 'this_month') return { date_from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, date_to: today }
  if (preset === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return { date_from: fmt(first), date_to: fmt(last) }
  }
  return { date_from: '', date_to: '' }
}

const STATUS_OPTIONS  = ['draft', 'pending_approval', 'confirmed', 'in_progress', 'completed', 'cancelled']
const TRIP_OPTIONS    = ['local', 'outstation', 'airport']
const SOURCE_OPTIONS  = ['manual', 'whatsapp', 'email', 'bulk']

const QUICK_RANGES = [
  { label: 'Today',       key: 'today' },
  { label: 'Last 7 Days', key: 'week' },
  { label: 'Last 30 Days',key: 'month' },
  { label: 'This Month',  key: 'this_month' },
  { label: 'Last Month',  key: 'last_month' },
]

function fmtDuration(open: string, close: string): string {
  const diff = new Date(close).getTime() - new Date(open).getTime()
  if (diff <= 0) return '—'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return `${h}h ${m}m`
}

function fmtManualDuration(openStr: string, closeStr: string): string {
  function toMin(t: string): number | null {
    const m24 = t.trim().match(/^(\d{1,2}):(\d{2})$/)
    if (m24) return parseInt(m24[1]) * 60 + parseInt(m24[2])
    const m12 = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (!m12) return null
    let h = parseInt(m12[1])
    if (m12[3].toUpperCase() === 'PM' && h !== 12) h += 12
    if (m12[3].toUpperCase() === 'AM' && h === 12) h = 0
    return h * 60 + parseInt(m12[2])
  }
  const open = toMin(openStr), close = toMin(closeStr)
  if (open === null || close === null) return '—'
  let diff = close - open
  if (diff < 0) diff += 24 * 60
  return `${Math.floor(diff / 60)}h ${diff % 60}m`
}

export default function ReportsPage() {
  const tableWrapRef  = useRef<HTMLDivElement>(null)
  const stickyBarRef  = useRef<HTMLDivElement>(null)
  const stickyInnerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrap = tableWrapRef.current
    const bar  = stickyBarRef.current
    const inner = stickyInnerRef.current
    if (!wrap || !bar || !inner) return

    function syncWidth() {
      if (wrap && inner) inner.style.width = `${wrap.scrollWidth}px`
    }
    function onWrapScroll()  { if (bar)  bar.scrollLeft  = wrap!.scrollLeft }
    function onBarScroll()   { if (wrap) wrap.scrollLeft = bar!.scrollLeft }

    syncWidth()
    const ro = new ResizeObserver(syncWidth)
    ro.observe(wrap)

    wrap.addEventListener('scroll', onWrapScroll)
    bar.addEventListener('scroll', onBarScroll)
    return () => {
      ro.disconnect()
      wrap.removeEventListener('scroll', onWrapScroll)
      bar.removeEventListener('scroll', onBarScroll)
    }
  }, [])

  const [filters, setFilters] = useState({ date_from: '', date_to: '' })
  const [tableFilters, setTableFilters] = useState({
    search: '', status: '', trip_type: '', source: '', company: '', driver: '',
  })

  const params = new URLSearchParams()
  if (filters.date_from) params.set('date_from', filters.date_from)
  if (filters.date_to)   params.set('date_to',   filters.date_to)

  const { data: bookings = [], isLoading } = useQuery<BookingWithSheet[]>({
    queryKey: ['reports', filters],
    queryFn: () => fetch(`/api/reports?${params}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
  })

  // Unique values for dropdowns — always from full loaded data so filters don't shrink
  const companyOptions = useMemo(() =>
    [...new Set(bookings.map(b => b.company?.name).filter(Boolean) as string[])].sort()
  , [bookings])

  const driverOptions = useMemo(() =>
    [...new Set(bookings.map(b => b.driver?.name).filter(Boolean) as string[])].sort()
  , [bookings])

  // Apply all table filters — charts and stats derive from this
  const filteredBookings = useMemo(() => {
    const q = tableFilters.search.toLowerCase().trim()
    return bookings.filter(b => {
      if (tableFilters.status    && b.status    !== tableFilters.status)    return false
      if (tableFilters.trip_type && b.trip_type !== tableFilters.trip_type) return false
      if (tableFilters.source    && b.source    !== tableFilters.source)    return false
      if (tableFilters.company   && b.company?.name !== tableFilters.company) return false
      if (tableFilters.driver    && b.driver?.name  !== tableFilters.driver)  return false
      if (q) {
        const hay = [
          b.booking_ref, b.guest_name, b.client?.name, b.company?.name,
          b.driver?.name, b.pickup_location, b.drop_location,
          b.trip_sheet?.tripsheet_number,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [bookings, tableFilters])

  // ── Stats (all from filteredBookings so they sync with filters) ─────────
  const stats = useMemo(() => {
    const total      = filteredBookings.length
    const completed  = filteredBookings.filter(b => b.status === 'completed').length
    const cancelled  = filteredBookings.filter(b => b.status === 'cancelled').length
    const inProgress = filteredBookings.filter(b => b.status === 'in_progress').length
    const outstation = filteredBookings.filter(b => b.trip_type === 'outstation').length
    const local      = filteredBookings.filter(b => b.trip_type === 'local').length
    const airport    = filteredBookings.filter(b => b.trip_type === 'airport').length
    const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0
    return { total, completed, cancelled, inProgress, outstation, local, airport, cancelRate }
  }, [filteredBookings])

  // ── Chart data (all from filteredBookings) ──────────────────────────────
  const STATUS_COLORS: Record<string, string> = {
    draft: '#94A3B8', pending_approval: '#F59E0B', confirmed: '#1A56DB',
    in_progress: '#7E3AF2', completed: '#059669', cancelled: '#DC2626',
  }
  const SOURCE_COLORS: Record<string, string> = {
    whatsapp: '#25D366', email: '#EA4335', manual: '#1A56DB', bulk: '#7E3AF2',
  }
  const TRIP_COLORS: Record<string, string> = {
    local: '#1A56DB', outstation: '#7E3AF2', airport: '#059669',
  }

  const statusCounts = useMemo(() => Object.entries(
    filteredBookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: name.replace('_', ' '), value, fill: STATUS_COLORS[name] || '#94A3B8' }))
  , [filteredBookings])

  const sourceCounts = useMemo(() => Object.entries(
    filteredBookings.reduce((acc, b) => { acc[b.source] = (acc[b.source] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value, fill: SOURCE_COLORS[name] || '#94A3B8' }))
  , [filteredBookings])

  const tripTypeCounts = useMemo(() => Object.entries(
    filteredBookings.reduce((acc, b) => { acc[b.trip_type] = (acc[b.trip_type] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value, fill: TRIP_COLORS[name] || '#94A3B8' }))
  , [filteredBookings])

  const topCompanies = useMemo(() => {
    const counts = filteredBookings.reduce((acc, b) => {
      const name = b.company?.name || 'Unknown'
      acc[name] = (acc[name] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name, value, fill: '#7B5EA7' }))
  }, [filteredBookings])

  const byDate = useMemo(() => Object.entries(
    filteredBookings.reduce((acc, b) => {
      const date = b.pickup_date || 'Unknown'
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date: date.slice(5), count }))
  , [filteredBookings])

  const hasTableFilter = tableFilters.search || tableFilters.status || tableFilters.trip_type
    || tableFilters.source || tableFilters.company || tableFilters.driver

  // ── Excel export ────────────────────────────────────────────────────────
  function exportToExcel() {
    const rows = filteredBookings.map(b => {
      const ts = b.trip_sheet
      const driverKm = (ts?.closing_km != null && ts?.opening_km != null)
        ? ts.closing_km - ts.opening_km : null
      const totalKm = driverKm != null
        ? driverKm + (ts?.office_to_pickup_km ?? 0) + (ts?.drop_to_office_km ?? 0)
        : null
      return {
        'Booking Ref':        b.booking_ref,
        'Client':             b.client?.name || b.guest_name || '',
        'Client Phone':       b.guest_phone || b.client?.primary_phone || '',
        'Company':            b.company?.name || '',
        'Driver':             b.driver?.name || '',
        'Driver Phone':       b.driver?.phone || '',
        'Vehicle':            b.driver?.vehicle_name || '',
        'Vehicle No.':        b.driver?.vehicle_number || '',
        'Vehicle Type':       b.vehicle_type || '',
        'Pickup':             b.pickup_location || '',
        'Drop':               b.drop_location || '',
        'Date':               b.pickup_date || '',
        'Time':               b.pickup_time || '',
        'Pax':                b.pax_count ?? '',
        'Trip Type':          b.trip_type,
        'Service Type':       b.service_type?.replace('_', ' ') || '',
        'Status':             b.status,
        'Source':             b.source,
        'Tripsheet No.':      ts?.tripsheet_number || '',
        'Opening KM':         ts?.opening_km ?? '',
        'Closing KM':         ts?.closing_km ?? '',
        'Driver KM':          driverKm ?? '',
        'GPS KM':             ts?.gps_km ?? '',
        'Office→Pickup KM':   ts?.office_to_pickup_km ?? '',
        'Drop→Office KM':     ts?.drop_to_office_km ?? '',
        'Total KM':           totalKm ?? '',
        'Toll (₹)':           ts?.toll_amount ?? '',
        'Parking (₹)':        ts?.parking_amount ?? '',
        'Permit (₹)':         ts?.permit_amount ?? '',
        'Bata (Driver)':      ts?.bata_driver ?? '',
        'Trip Start':         ts?.opening_time ? new Date(ts.opening_time).toLocaleString('en-IN') : '',
        'Trip End':           ts?.closing_time ? new Date(ts.closing_time).toLocaleString('en-IN') : '',
        'Duration':           ts?.opening_time && ts?.closing_time ? fmtDuration(ts.opening_time, ts.closing_time) : '',
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
    XLSX.writeFile(wb, `jmstravels-report-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={exportToExcel}
            disabled={filteredBookings.length === 0}
          >
            <Download className="w-4 h-4" /> Export Excel
          </Button>
        }
      />

      {/* Date range filters */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_RANGES.map(r => {
            const range = quickRange(r.key)
            const active = filters.date_from === range.date_from && filters.date_to === range.date_to
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setFilters(range)}
                className={`px-3 h-8 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-[#1A56DB] text-white border-[#1A56DB]'
                    : 'border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB] hover:text-[#1A56DB] hover:bg-[#EEF2FF]'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <Label className="text-xs text-[#737686]">From</Label>
            <Input
              type="date"
              value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
              className="border-[#C3C5D7] h-8 text-sm w-36 mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-[#737686]">To</Label>
            <Input
              type="date"
              value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
              className="border-[#C3C5D7] h-8 text-sm w-36 mt-1"
            />
          </div>
          {(filters.date_from || filters.date_to) && (
            <button
              type="button"
              onClick={() => setFilters({ date_from: '', date_to: '' })}
              className="text-xs text-[#737686] hover:text-red-600 transition-colors mt-4"
            >
              Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Stat cards — sync with filteredBookings */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        {[
          { label: 'Total',          value: stats.total,                   color: '#1A56DB' },
          { label: 'In Progress',    value: stats.inProgress,              color: '#7E3AF2' },
          { label: 'Completed',      value: stats.completed,               color: '#059669' },
          { label: 'Cancelled',      value: stats.cancelled,               color: '#DC2626' },
          { label: 'Cancel Rate',    value: `${stats.cancelRate}%`,        color: '#D97706' },
          { label: 'Local',          value: stats.local,                   color: '#1A56DB' },
          { label: 'Outstation',     value: stats.outstation,              color: '#7B5EA7' },
          { label: 'Airport',        value: stats.airport,                 color: '#059669' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-[#C3C5D7] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#737686]">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts — all from filteredBookings */}
      {filteredBookings.length > 0 && (
        <ReportsCharts
          statusCounts={statusCounts}
          sourceCounts={sourceCounts}
          tripTypeCounts={tripTypeCounts}
          topCompanies={topCompanies}
          byDate={byDate}
        />
      )}

      {/* Table filters */}
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737686] pointer-events-none" />
          <Input
            placeholder="Ref, client, driver, location…"
            value={tableFilters.search}
            onChange={e => setTableFilters(f => ({ ...f, search: e.target.value }))}
            className="pl-8 h-8 text-xs border-[#C3C5D7]"
          />
        </div>
        {[
          { key: 'status',    options: STATUS_OPTIONS,  placeholder: 'All Statuses' },
          { key: 'trip_type', options: TRIP_OPTIONS,    placeholder: 'All Types' },
          { key: 'source',    options: SOURCE_OPTIONS,  placeholder: 'All Sources' },
        ].map(({ key, options, placeholder }) => (
          <select
            key={key}
            value={tableFilters[key as keyof typeof tableFilters]}
            onChange={e => setTableFilters(f => ({ ...f, [key]: e.target.value }))}
            className={`h-8 px-2 text-xs rounded-md border transition-colors outline-none ${tableFilters[key as keyof typeof tableFilters] ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EEF2FF]' : 'border-[#C3C5D7] text-[#434654]'}`}
          >
            <option value="">{placeholder}</option>
            {options.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
          </select>
        ))}
        {companyOptions.length > 0 && (
          <select
            value={tableFilters.company}
            onChange={e => setTableFilters(f => ({ ...f, company: e.target.value }))}
            className={`h-8 px-2 text-xs rounded-md border transition-colors outline-none max-w-[140px] ${tableFilters.company ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EEF2FF]' : 'border-[#C3C5D7] text-[#434654]'}`}
          >
            <option value="">All Companies</option>
            {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {driverOptions.length > 0 && (
          <select
            value={tableFilters.driver}
            onChange={e => setTableFilters(f => ({ ...f, driver: e.target.value }))}
            className={`h-8 px-2 text-xs rounded-md border transition-colors outline-none max-w-[140px] ${tableFilters.driver ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EEF2FF]' : 'border-[#C3C5D7] text-[#434654]'}`}
          >
            <option value="">All Drivers</option>
            {driverOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        {hasTableFilter && (
          <button
            type="button"
            onClick={() => setTableFilters({ search: '', status: '', trip_type: '', source: '', company: '', driver: '' })}
            className="flex items-center gap-1 h-8 px-2 text-xs text-[#737686] hover:text-red-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <span className="text-xs text-[#737686] ml-auto shrink-0">
          {filteredBookings.length} of {bookings.length}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading report…</div>
      ) : (
        <>
        <div ref={tableWrapRef} className="bg-white rounded-lg border border-[#C3C5D7] overflow-x-auto">
          <table className="w-full text-sm min-w-[320px] sm:min-w-[640px] lg:min-w-[1400px]">
            <thead>
              <tr className="border-b border-[#C3C5D7] bg-[#F3F3FE]">
                {/* Always visible */}
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Ref</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Client</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Date</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Status</th>
                {/* sm+ */}
                <th className="hidden sm:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Company</th>
                <th className="hidden sm:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Driver</th>
                <th className="hidden sm:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Trip</th>
                {/* lg+ */}
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Vehicle</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Pickup</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Drop</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Time</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Pax</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#737686] whitespace-nowrap">Source</th>
                {/* Tripsheet — lg+ only */}
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap border-l border-[#C3C5D7]">Sheet No.</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Open Time</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Close Time</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Open KM</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Close KM</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Driver KM</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">GPS KM</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Total KM</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Toll</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Parking</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Permit</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Bata</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">Driver Hrs</th>
                <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#7E3AF2] whitespace-nowrap">GPS Hrs</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.length === 0 ? (
                <tr><td colSpan={25} className="px-3 py-8 text-center text-[#737686]">No bookings match the selected filters</td></tr>
              ) : filteredBookings.map(b => {
                const ts = b.trip_sheet
                const driverKm = (ts?.closing_km != null && ts?.opening_km != null)
                  ? ts.closing_km - ts.opening_km : null
                const totalKm = driverKm != null
                  ? driverKm + (ts?.office_to_pickup_km ?? 0) + (ts?.drop_to_office_km ?? 0)
                  : null
                const gpsHrs    = ts?.opening_time && ts?.closing_time ? fmtDuration(ts.opening_time, ts.closing_time) : '—'
                const driverHrs = ts?.manual_opening_time && ts?.manual_closing_time ? fmtManualDuration(ts.manual_opening_time, ts.manual_closing_time) : '—'
                return (
                  <tr key={b.id} className="border-b border-[#C3C5D7] last:border-0 hover:bg-[#F3F3FE]">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={`/bookings/${b.id}`} className="font-medium text-[#1A56DB] hover:underline hover:text-[#003FB1]">{b.booking_ref}</a>
                    </td>
                    <td className="px-3 py-2 text-[#191B23] whitespace-nowrap max-w-[100px] truncate">{b.client?.name || b.guest_name || '—'}</td>
                    <td className="px-3 py-2 text-[#434654] whitespace-nowrap">{b.pickup_date || '—'}</td>
                    <td className="px-3 py-2"><BookingStatusBadge status={b.status} /></td>
                    <td className="hidden sm:table-cell px-3 py-2 text-[#434654] whitespace-nowrap">{b.company?.name || '—'}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-[#434654] whitespace-nowrap">{b.driver?.name || '—'}</td>
                    <td className="hidden sm:table-cell px-3 py-2 text-[#434654] capitalize">{b.trip_type}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] whitespace-nowrap">{b.driver?.vehicle_name || '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] max-w-[140px] truncate">{b.pickup_location || '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] max-w-[140px] truncate">{b.drop_location || '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] whitespace-nowrap">{b.pickup_time || '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-center">{b.pax_count ?? '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] capitalize">{b.source}</td>
                    {/* Tripsheet columns — lg+ */}
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] whitespace-nowrap border-l border-[#C3C5D7]">{ts?.tripsheet_number || '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 whitespace-nowrap">
                      <div className="text-sm text-[#191B23]">{ts?.manual_opening_time ?? '—'}</div>
                      {ts?.opening_time && <div className="text-[11px] text-[#9CA3AF]">GPS: {new Date(ts.opening_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2 whitespace-nowrap">
                      <div className="text-sm text-[#191B23]">{ts?.manual_closing_time ?? '—'}</div>
                      {ts?.closing_time && <div className="text-[11px] text-[#9CA3AF]">GPS: {new Date(ts.closing_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>}
                    </td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-right">{ts?.opening_km?.toLocaleString() ?? '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-right">{ts?.closing_km?.toLocaleString() ?? '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#191B23] font-medium text-right">{driverKm != null ? driverKm.toFixed(1) : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-right">{ts?.gps_km != null ? ts.gps_km.toFixed(1) : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#1A56DB] font-semibold text-right">{totalKm != null ? totalKm.toFixed(1) : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-right">{ts?.toll_amount != null ? `₹${ts.toll_amount}` : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-right">{ts?.parking_amount != null ? `₹${ts.parking_amount}` : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] text-right">{ts?.permit_amount != null ? `₹${ts.permit_amount}` : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#1A56DB] font-medium text-right">{ts?.bata_driver != null && ts.bata_driver > 0 ? `${ts.bata_driver}` : '—'}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] whitespace-nowrap">{driverHrs}</td>
                    <td className="hidden lg:table-cell px-3 py-2 text-[#434654] whitespace-nowrap">{gpsHrs}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Sticky horizontal scrollbar — synced with table above */}
        <div
          ref={stickyBarRef}
          className="sticky bottom-0 overflow-x-auto overflow-y-hidden border-t border-[#E5E7EB] bg-white z-10"
          style={{ height: 14 }}
        >
          <div ref={stickyInnerRef} style={{ height: 1 }} />
        </div>
        </>
      )}
    </div>
  )
}
