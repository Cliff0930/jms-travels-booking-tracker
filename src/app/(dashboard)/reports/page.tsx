'use client'
import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { Download, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  driver?: Booking['driver'] & { vehicle_color?: string; secondary_phone?: string; bata_rate?: number }
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
      const bataAmt = ts?.bata_driver != null && b.driver?.bata_rate != null
        ? ts.bata_driver * Number(b.driver.bata_rate) : null
      return {
        'Booking Ref':        b.booking_ref,
        'Booking Type':       b.booking_type || '',
        'Client':             b.client?.name || b.guest_name || '',
        'Traveller':          b.guest_name || '',
        'Coordinator':        b.requested_by || '',
        'Client Phone':       b.guest_phone || b.client?.primary_phone || '',
        'Company':            b.company?.name || '',
        'Department':         b.department || '',
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
        'Service Type':       (b as Record<string, unknown>).service_type as string || '',
        'Total Days':         b.total_days ?? '',
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
        'Bata Count':         ts?.bata_driver ?? '',
        'Bata Amount (₹)':    bataAmt ?? '',
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
    <div className="space-y-5">

      {/* ── Hero header ────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        <div className="px-6 py-5">
          {/* Title + actions */}
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold text-white">Trip Reports</h1>
              <p className="text-indigo-300 text-sm mt-0.5">All bookings with tripsheet data · filter · export</p>
            </div>
            <Button
              size="sm"
              onClick={exportToExcel}
              disabled={filteredBookings.length === 0}
              className="bg-white/15 hover:bg-white/25 text-white border-white/20 border gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Excel
            </Button>
          </div>

          {/* Period picker */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="flex rounded-lg overflow-hidden border border-white/20">
              {QUICK_RANGES.map(r => {
                const range = quickRange(r.key)
                const active = filters.date_from === range.date_from && filters.date_to === range.date_to
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setFilters(range)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold transition-colors border-r border-white/10 last:border-0',
                      active ? 'bg-white text-indigo-900' : 'text-white/70 hover:bg-white/10'
                    )}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
              <span className="text-white/50 text-xs">–</span>
              <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
              {(filters.date_from || filters.date_to) && (
                <button onClick={() => setFilters({ date_from: '', date_to: '' })}
                  className="text-white/50 hover:text-white text-xs px-1">✕</button>
              )}
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {[
              { label: 'Total',       value: stats.total,            bg: 'from-blue-500/20 to-blue-600/10' },
              { label: 'In Progress', value: stats.inProgress,       bg: 'from-violet-500/20 to-violet-600/10' },
              { label: 'Completed',   value: stats.completed,        bg: 'from-emerald-500/20 to-emerald-600/10', green: true },
              { label: 'Cancelled',   value: stats.cancelled,        bg: 'from-red-500/25 to-red-600/10',  red: true },
              { label: 'Cancel Rate', value: `${stats.cancelRate}%`, bg: 'from-amber-500/20 to-amber-600/10', amber: true },
              { label: 'Local',       value: stats.local,            bg: 'from-blue-400/20 to-blue-500/10' },
              { label: 'Outstation',  value: stats.outstation,       bg: 'from-purple-500/20 to-purple-600/10' },
              { label: 'Airport',     value: stats.airport,          bg: 'from-teal-500/20 to-teal-600/10' },
            ].map(s => (
              <div key={s.label} className={cn('rounded-xl p-3 bg-gradient-to-br border border-white/10', s.bg)}>
                <div className={cn('text-xl font-bold', s.red ? 'text-red-300' : s.green ? 'text-emerald-300' : s.amber ? 'text-amber-300' : 'text-white')}>
                  {s.value}
                </div>
                <div className="text-[10px] text-white/50 mt-0.5 truncate">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Charts ─────────────────────────────────────────────────── */}
      {filteredBookings.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">Analytics Charts</p>
          <ReportsCharts
            statusCounts={statusCounts}
            sourceCounts={sourceCounts}
            tripTypeCounts={tripTypeCounts}
            topCompanies={topCompanies}
            byDate={byDate}
          />
        </div>
      )}

      {/* ── Table filters ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-800 px-4 py-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Ref, client, driver, location…"
              value={tableFilters.search}
              onChange={e => setTableFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-8 h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:bg-white/20"
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
              className={cn(
                'h-8 px-2 text-xs rounded-lg border outline-none transition-colors',
                tableFilters[key as keyof typeof tableFilters]
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-white/10 border-white/20 text-gray-300'
              )}
            >
              <option value="">{placeholder}</option>
              {options.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
            </select>
          ))}
          {companyOptions.length > 0 && (
            <select
              value={tableFilters.company}
              onChange={e => setTableFilters(f => ({ ...f, company: e.target.value }))}
              className={cn('h-8 px-2 text-xs rounded-lg border outline-none max-w-[140px]',
                tableFilters.company ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/10 border-white/20 text-gray-300')}
            >
              <option value="">All Companies</option>
              {companyOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {driverOptions.length > 0 && (
            <select
              value={tableFilters.driver}
              onChange={e => setTableFilters(f => ({ ...f, driver: e.target.value }))}
              className={cn('h-8 px-2 text-xs rounded-lg border outline-none max-w-[140px]',
                tableFilters.driver ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/10 border-white/20 text-gray-300')}
            >
              <option value="">All Drivers</option>
              {driverOptions.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {hasTableFilter && (
            <button
              type="button"
              onClick={() => setTableFilters({ search: '', status: '', trip_type: '', source: '', company: '', driver: '' })}
              className="flex items-center gap-1 h-8 px-2 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {filteredBookings.length} of {bookings.length} trips
          </span>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="py-12 text-center text-gray-400">Loading report…</div>
        ) : (
          <>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm min-w-[320px] sm:min-w-[640px] lg:min-w-[1400px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-900">
                  <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Ref</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Client</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Traveller</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Coordinator</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Date</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Status</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Type</th>
                  <th className="hidden sm:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Company</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Department</th>
                  <th className="hidden sm:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Driver</th>
                  <th className="hidden sm:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Trip</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Service</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Days</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Vehicle</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Plate No.</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Pickup</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Drop</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Time</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Pax</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Source</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap border-l border-gray-700">Sheet No.</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Open Time</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Close Time</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Open KM</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Close KM</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Driver KM</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">GPS KM</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Total KM</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Office→Pickup</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Drop→Office</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Toll</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Parking</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Permit</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Bata</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Bata (₹)</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">Driver Hrs</th>
                  <th className="hidden lg:table-cell text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-violet-400 whitespace-nowrap">GPS Hrs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBookings.length === 0 ? (
                  <tr><td colSpan={37} className="px-3 py-10 text-center text-gray-400">No bookings match the selected filters</td></tr>
                ) : filteredBookings.map((b, idx) => {
                  const ts = b.trip_sheet
                  const driverKm = (ts?.closing_km != null && ts?.opening_km != null)
                    ? ts.closing_km - ts.opening_km : null
                  const totalKm = driverKm != null
                    ? driverKm + (ts?.office_to_pickup_km ?? 0) + (ts?.drop_to_office_km ?? 0)
                    : null
                  const gpsHrs    = ts?.opening_time && ts?.closing_time ? fmtDuration(ts.opening_time, ts.closing_time) : '—'
                  const driverHrs = ts?.manual_opening_time && ts?.manual_closing_time ? fmtManualDuration(ts.manual_opening_time, ts.manual_closing_time) : '—'
                  const bataAmt = ts?.bata_driver != null && b.driver?.bata_rate != null
                    ? ts.bata_driver * Number(b.driver.bata_rate) : null
                  return (
                    <tr key={b.id} className={cn('hover:bg-indigo-50/40 transition-colors', idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white')}>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <a href={`/bookings/${b.id}`} className="font-bold text-indigo-600 hover:underline hover:text-indigo-800">{b.booking_ref}</a>
                      </td>
                      <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap max-w-[100px] truncate font-medium">{b.client?.name || b.guest_name || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-600 whitespace-nowrap max-w-[120px] truncate">{b.guest_name || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap max-w-[120px] truncate">{b.requested_by || '—'}</td>
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.pickup_date || '—'}</td>
                      <td className="px-3 py-2.5"><BookingStatusBadge status={b.status} /></td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap capitalize">{b.booking_type || '—'}</td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-gray-600 whitespace-nowrap">{b.company?.name || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap max-w-[120px] truncate">{b.department || '—'}</td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-gray-600 whitespace-nowrap">{b.driver?.name || '—'}</td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-gray-600 capitalize">{b.trip_type}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 capitalize whitespace-nowrap">{(b as Record<string, unknown>).service_type as string || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-center">{b.total_days ?? '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.driver?.vehicle_name || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 font-mono whitespace-nowrap">{b.driver?.vehicle_number || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 max-w-[140px] truncate">{b.pickup_location || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 max-w-[140px] truncate">{b.drop_location || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap">{b.pickup_time || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-center">{b.pax_count ?? '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 capitalize">{b.source}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap border-l border-gray-100">{ts?.tripsheet_number || '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 whitespace-nowrap">
                        <div className="text-sm text-gray-800">{ts?.manual_opening_time ?? '—'}</div>
                        {ts?.opening_time && <div className="text-[11px] text-gray-400">GPS: {new Date(ts.opening_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2.5 whitespace-nowrap">
                        <div className="text-sm text-gray-800">{ts?.manual_closing_time ?? '—'}</div>
                        {ts?.closing_time && <div className="text-[11px] text-gray-400">GPS: {new Date(ts.closing_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.opening_km?.toLocaleString() ?? '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.closing_km?.toLocaleString() ?? '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-800 font-semibold text-right">{driverKm != null ? driverKm.toFixed(1) : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.gps_km != null ? ts.gps_km.toFixed(1) : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-indigo-600 font-bold text-right">{totalKm != null ? totalKm.toFixed(1) : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.office_to_pickup_km != null ? ts.office_to_pickup_km.toFixed(1) : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.drop_to_office_km != null ? ts.drop_to_office_km.toFixed(1) : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.toll_amount != null ? `₹${ts.toll_amount}` : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.parking_amount != null ? `₹${ts.parking_amount}` : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 text-right">{ts?.permit_amount != null ? `₹${ts.permit_amount}` : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-indigo-500 font-medium text-right">{ts?.bata_driver != null && ts.bata_driver > 0 ? `${ts.bata_driver}` : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-indigo-500 font-medium text-right">{bataAmt != null ? `₹${bataAmt.toFixed(0)}` : '—'}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap">{driverHrs}</td>
                      <td className="hidden lg:table-cell px-3 py-2.5 text-gray-500 whitespace-nowrap">{gpsHrs}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
