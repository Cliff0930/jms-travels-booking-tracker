'use client'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Download, ExternalLink, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as XLSX from 'xlsx'

const BarChart          = dynamic(() => import('recharts').then(m => m.BarChart),          { ssr: false })
const Bar               = dynamic(() => import('recharts').then(m => m.Bar),               { ssr: false })
const XAxis             = dynamic(() => import('recharts').then(m => m.XAxis),             { ssr: false })
const YAxis             = dynamic(() => import('recharts').then(m => m.YAxis),             { ssr: false })
const Tooltip           = dynamic(() => import('recharts').then(m => m.Tooltip),           { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface Summary { total: number; totalBookings: number; cancelRate: number; personal: number; corporate: number }
interface CompanyRow  { company_id: string; company_name: string; count: number }
interface DriverRow   { driver_id: string; driver_name: string; count: number }
interface ReasonRow   { reason: string; count: number }
interface MonthRow    { month: string; label: string; count: number }
interface RecentRow   { id: string; booking_ref: string; booking_type: string; pickup_date: string; cancelled_at: string | null; reason: string; company_name: string | null; driver_name: string | null }
interface CancellationData {
  period: { from: string; to: string }
  summary: Summary
  byCompany: CompanyRow[]
  byDriver: DriverRow[]
  byReason: ReasonRow[]
  byMonth: MonthRow[]
  recent: RecentRow[]
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d.slice(0,10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const PRESETS = [
  { label: 'This year',     days: -1 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 30 days',  days: 30 },
]

function buildDates(preset: number): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  if (preset === -1) return { from: `${now.getFullYear()}-01-01`, to: fmt(now) }
  const from = new Date(now); from.setDate(from.getDate() - preset)
  return { from: fmt(from), to: fmt(now) }
}

export default function CancellationAnalysisPage() {
  const [preset, setPreset] = useState(-1)
  const [customFrom, setFrom] = useState('')
  const [customTo, setTo]     = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const { from, to } = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : buildDates(preset)

  const { data, isLoading } = useQuery<CancellationData>({
    queryKey: ['cancellations', from, to],
    queryFn: () => fetch(`/api/analytics/cancellations?date_from=${from}&date_to=${to}`).then(r => r.json()),
  })

  function exportXlsx() {
    if (!data) return
    const rows = data.recent.map(r => ({
      'Booking Ref':   r.booking_ref,
      'Type':          r.booking_type === 'company' ? 'Corporate' : 'Personal',
      'Company':       r.company_name ?? '',
      'Driver':        r.driver_name ?? '',
      'Trip Date':     r.pickup_date,
      'Cancelled At':  r.cancelled_at ? r.cancelled_at.slice(0,10) : '',
      'Reason':        r.reason,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cancellations')
    XLSX.writeFile(wb, `cancellations-${from}-to-${to}.xlsx`)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const s = data?.summary
  const maxCompany = Math.max(1, ...(data?.byCompany.map(c => c.count) ?? [1]))
  const maxDriver  = Math.max(1, ...(data?.byDriver.map(d => d.count)  ?? [1]))
  const maxReason  = Math.max(1, ...(data?.byReason.map(r => r.count)  ?? [1]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Cancellation Analysis</h1>
          <p className="text-sm text-gray-500 mt-0.5">Who cancels, why, and when</p>
        </div>
        <button onClick={exportXlsx} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Period controls */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button key={p.days} onClick={() => { setPreset(p.days); setUseCustom(false) }}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors',
              !useCustom && preset === p.days ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <input type="date" value={customFrom} onChange={e => { setFrom(e.target.value); setUseCustom(true) }}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={customTo} onChange={e => { setTo(e.target.value); setUseCustom(true) }}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Summary cards */}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Total Cancelled</span>
            <span className="text-2xl font-black text-red-700">{s.total}</span>
            <span className="text-xs text-red-400">of {s.totalBookings} bookings</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cancel Rate</span>
            <span className={cn('text-2xl font-black', s.cancelRate >= 15 ? 'text-red-700' : s.cancelRate >= 8 ? 'text-amber-600' : 'text-emerald-700')}>
              {s.cancelRate}%
            </span>
            <span className="text-xs text-gray-400">{s.cancelRate < 8 ? 'Healthy' : s.cancelRate < 15 ? 'Watch this' : 'High — investigate'}</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Corporate</span>
            <span className="text-2xl font-black text-blue-700">{s.corporate}</span>
            <span className="text-xs text-gray-400">{s.total > 0 ? Math.round((s.corporate / s.total) * 100) : 0}% of cancels</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Personal</span>
            <span className="text-2xl font-black text-gray-700">{s.personal}</span>
            <span className="text-xs text-gray-400">{s.total > 0 ? Math.round((s.personal / s.total) * 100) : 0}% of cancels</span>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Companies Involved</span>
            <span className="text-2xl font-black text-gray-700">{data?.byCompany.length ?? 0}</span>
            <span className="text-xs text-gray-400">unique companies</span>
          </div>
        </div>
      )}

      {/* Monthly trend chart */}
      {data && data.byMonth.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Monthly cancellation trend</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.byMonth} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="count" name="Cancellations" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Three columns: company / driver / reason */}
      {data && data.summary.total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* By company */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">By Company</h2>
            {data.byCompany.length === 0
              ? <p className="text-sm text-gray-400">No corporate cancellations.</p>
              : data.byCompany.slice(0, 8).map(c => (
                <div key={c.company_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800 truncate mr-2">{c.company_name}</span>
                    <span className="font-bold text-red-700 shrink-0">{c.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${(c.count / maxCompany) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>

          {/* By driver */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">By Driver</h2>
            {data.byDriver.length === 0
              ? <p className="text-sm text-gray-400">No driver-assigned cancellations.</p>
              : data.byDriver.slice(0, 8).map(d => (
                <div key={d.driver_id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-800 truncate mr-2">{d.driver_name}</span>
                    <span className="font-bold text-orange-700 shrink-0">{d.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-400 rounded-full" style={{ width: `${(d.count / maxDriver) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>

          {/* By reason */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">By Reason</h2>
            {data.byReason.length === 0
              ? <p className="text-sm text-gray-400">No reasons recorded.</p>
              : data.byReason.slice(0, 8).map((r, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-start justify-between text-sm gap-2">
                    <span className="text-gray-700 leading-snug">{r.reason}</span>
                    <span className="font-bold text-purple-700 shrink-0">{r.count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-400 rounded-full" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent cancellations table */}
      {data && data.recent.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Recent Cancellations</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Booking Ref', 'Type', 'Company / Client', 'Driver', 'Trip Date', 'Reason', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recent.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{r.booking_ref}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        r.booking_type === 'company' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                        {r.booking_type === 'company' ? 'Corporate' : 'Personal'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[120px] truncate">{r.company_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.driver_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(r.pickup_date)}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate" title={r.reason}>{r.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/bookings/${r.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && data.summary.total === 0 && (
        <div className="flex items-center gap-3 p-6 rounded-xl bg-green-50 border border-green-200 text-green-700">
          <XCircle className="w-5 h-5 shrink-0" />
          <span className="font-semibold">No cancellations in this period.</span>
        </div>
      )}
    </div>
  )
}
