'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { Booking } from '@/types'

const ReportsCharts = dynamic(() => import('./ReportsCharts'), { ssr: false })

const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8',
  pending_approval: '#F59E0B',
  confirmed: '#1A56DB',
  in_progress: '#7E3AF2',
  completed: '#059669',
  cancelled: '#DC2626',
}

const SOURCE_COLORS: Record<string, string> = {
  whatsapp: '#25D366',
  email: '#EA4335',
  manual: '#1A56DB',
  bulk: '#7E3AF2',
}

function quickRange(preset: string): { date_from: string; date_to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)

  if (preset === 'today') return { date_from: today, date_to: today }
  if (preset === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 6)
    return { date_from: fmt(d), date_to: today }
  }
  if (preset === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 29)
    return { date_from: fmt(d), date_to: today }
  }
  if (preset === 'this_month') {
    return { date_from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, date_to: today }
  }
  if (preset === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last = new Date(now.getFullYear(), now.getMonth(), 0)
    return { date_from: fmt(first), date_to: fmt(last) }
  }
  return { date_from: '', date_to: '' }
}

export default function ReportsPage() {
  const [filters, setFilters] = useState({ date_from: '', date_to: '' })

  const params = new URLSearchParams()
  if (filters.date_from) params.set('date_from', filters.date_from)
  if (filters.date_to) params.set('date_to', filters.date_to)

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ['reports', filters],
    queryFn: () => fetch(`/api/bookings?${params}`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() }),
  })

  // --- Chart data ---
  const statusCounts = Object.entries(
    bookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name: name.replace('_', ' '), value, fill: STATUS_COLORS[name] || '#94A3B8' }))

  const sourceCounts = Object.entries(
    bookings.reduce((acc, b) => { acc[b.source] = (acc[b.source] || 0) + 1; return acc }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value, fill: SOURCE_COLORS[name] || '#94A3B8' }))

  const byDate = Object.entries(
    bookings.reduce((acc, b) => {
      const date = b.pickup_date || 'Unknown'
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  ).sort(([a], [b2]) => a.localeCompare(b2))
    .map(([date, count]) => ({ date: date.slice(5), count })) // MM-DD format

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  }

  function exportToExcel() {
    const rows = bookings.map(b => ({
      'Booking Ref': b.booking_ref,
      'Client': b.client?.name || b.guest_name || '',
      'Company': b.company?.name || '',
      'Driver': b.driver?.name || '',
      'Vehicle': b.driver?.vehicle_name || '',
      'Pickup': b.pickup_location || '',
      'Drop': b.drop_location || '',
      'Date': b.pickup_date || '',
      'Time': b.pickup_time || '',
      'Trip Type': b.trip_type,
      'Status': b.status,
      'Source': b.source,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings')
    XLSX.writeFile(wb, `jmstravels-report-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const QUICK_RANGES = [
    { label: 'Today', key: 'today' },
    { label: 'Last 7 Days', key: 'week' },
    { label: 'Last 30 Days', key: 'month' },
    { label: 'This Month', key: 'this_month' },
    { label: 'Last Month', key: 'last_month' },
  ]

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={exportToExcel}
            disabled={bookings.length === 0}
          >
            <Download className="w-4 h-4" /> Export Excel
          </Button>
        }
      />

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-4 mb-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">From Date</Label>
            <Input
              type="date"
              value={filters.date_from}
              onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))}
              className="border-[#C3C5D7] h-8 text-sm w-36"
            />
          </div>
          <div>
            <Label className="text-xs">To Date</Label>
            <Input
              type="date"
              value={filters.date_to}
              onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))}
              className="border-[#C3C5D7] h-8 text-sm w-36"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap pb-0.5">
            {QUICK_RANGES.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setFilters(quickRange(r.key))}
                className="px-2.5 py-1 rounded text-xs font-medium border border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB] hover:text-[#1A56DB] hover:bg-[#EEF2FF] transition-colors"
              >
                {r.label}
              </button>
            ))}
            {(filters.date_from || filters.date_to) && (
              <button
                type="button"
                onClick={() => setFilters({ date_from: '', date_to: '' })}
                className="px-2.5 py-1 rounded text-xs text-[#737686] hover:text-red-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total', value: stats.total, color: '#1A56DB', bg: '#DBEAFE' },
          { label: 'Confirmed', value: stats.confirmed, color: '#1A56DB', bg: '#DBEAFE' },
          { label: 'Completed', value: stats.completed, color: '#059669', bg: '#D1FAE5' },
          { label: 'Cancelled', value: stats.cancelled, color: '#DC2626', bg: '#FEE2E2' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg border border-[#C3C5D7] p-4">
            <p className="text-label-caps text-[#737686]">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {bookings.length > 0 && (
        <ReportsCharts statusCounts={statusCounts} sourceCounts={sourceCounts} byDate={byDate} />
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading report…</div>
      ) : (
        <div className="bg-white rounded-lg border border-[#C3C5D7] overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-[#C3C5D7] bg-[#F3F3FE]">
                {['Booking Ref', 'Client', 'Company', 'Driver', 'Pickup', 'Drop', 'Date', 'Trip', 'Status', 'Source'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-label-caps text-[#737686] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-[#737686]">No bookings match the selected filters</td></tr>
              ) : bookings.map(b => (
                <tr key={b.id} className="border-b border-[#C3C5D7] last:border-0 hover:bg-[#F3F3FE]">
                  <td className="px-3 py-2.5 font-medium text-[#1A56DB]">{b.booking_ref}</td>
                  <td className="px-3 py-2.5 text-[#191B23]">{b.client?.name || b.guest_name || '—'}</td>
                  <td className="px-3 py-2.5 text-[#434654]">{b.company?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-[#434654]">{b.driver?.name || '—'}</td>
                  <td className="px-3 py-2.5 text-[#434654] max-w-[160px] truncate">{b.pickup_location || '—'}</td>
                  <td className="px-3 py-2.5 text-[#434654] max-w-[160px] truncate">{b.drop_location || '—'}</td>
                  <td className="px-3 py-2.5 text-[#434654] whitespace-nowrap">{b.pickup_date || '—'}</td>
                  <td className="px-3 py-2.5 text-[#434654] capitalize">{b.trip_type}</td>
                  <td className="px-3 py-2.5"><BookingStatusBadge status={b.status} /></td>
                  <td className="px-3 py-2.5 text-[#434654] capitalize">{b.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
