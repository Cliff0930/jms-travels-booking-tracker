'use client'
import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Building2, CheckCircle2, AlertCircle, TrendingUp, ExternalLink, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import type { BookingStatus } from '@/types'

const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), { ssr: false })
const Bar      = dynamic(() => import('recharts').then(m => m.Bar),      { ssr: false })
const XAxis    = dynamic(() => import('recharts').then(m => m.XAxis),    { ssr: false })
const YAxis    = dynamic(() => import('recharts').then(m => m.YAxis),    { ssr: false })
const Tooltip  = dynamic(() => import('recharts').then(m => m.Tooltip),  { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
}
function fmtFull(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

interface Scorecard {
  company: { id: string; name: string; gstin: string | null; address: string | null; approval_required: boolean }
  period: { from: string; to: string }
  summary: { trips: number; cancels: number; active: number; cancelRate: number; billed: number; collected: number; outstanding: number }
  tripTypes: Record<string, number>
  monthlyVolume: { month: string; count: number }[]
  topTravellers: { name: string; phone: string | null; trips: number }[]
  invoices: { id: string; invoice_number: string | null; grand_total: number; balance_due: number; status: string; period_from: string; period_to: string }[]
  recentBookings: { id: string; booking_ref: string; status: string; pickup_date: string | null; pickup_time: string | null; trip_type: string; guest_name: string | null; pickup_location: string | null; drop_location: string | null; driver?: { name: string } | null }[]
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700', partially_paid: 'bg-yellow-50 text-yellow-700',
  overdue: 'bg-red-50 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
}

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')

export default function CompanyScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState(`${now.getFullYear()}-01-01`)
  const [dateTo,   setDateTo]   = useState(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`)

  const { data, isLoading, error } = useQuery<Scorecard>({
    queryKey: ['company-scorecard', id, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/company?company_id=${id}&date_from=${dateFrom}&date_to=${dateTo}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json
    },
    enabled: !!id,
  })

  function exportExcel() {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([data.summary]), 'Summary')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.topTravellers), 'Top Travellers')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.invoices), 'Invoices')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.recentBookings.map(b => ({
      'Booking Ref': b.booking_ref, 'Date': b.pickup_date, 'Status': b.status,
      'Trip Type': b.trip_type, 'Guest': b.guest_name, 'Driver': b.driver?.name,
      'Pickup': b.pickup_location, 'Drop': b.drop_location,
    }))), 'Bookings')
    XLSX.writeFile(wb, `scorecard-${data.company.name.replace(/\s+/g, '-')}.xlsx`)
  }

  if (isLoading) return (
    <div className="space-y-5">
      <div className="h-48 rounded-2xl bg-gradient-to-br from-[#1e1b4b] to-[#4c1d95] animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    </div>
  )

  if (error || !data) return (
    <div className="py-16 text-center text-gray-400">Failed to load scorecard</div>
  )

  const s = data.summary
  const collectionRate = s.billed > 0 ? Math.round(((s.billed - s.outstanding) / s.billed) * 100) : 0
  const tripTypeEntries = Object.entries(data.tripTypes).sort(([,a],[,b]) => b - a)

  return (
    <div className="space-y-5">

      {/* ── Hero header ────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        <div className="px-6 py-5">
          {/* Nav + actions */}
          <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/analytics/companies')}
                className="flex items-center gap-1 text-indigo-300 hover:text-white text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> Companies
              </button>
              <span className="text-white/20">/</span>
              <span className="text-white text-sm font-semibold">{data.company.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
                <span className="text-white/50 text-xs">–</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
              </div>
              <button onClick={exportExcel}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>

          {/* Company identity */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-lg">
              {data.company.name.slice(0,2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{data.company.name}</h1>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {data.company.gstin && <span className="text-xs font-mono text-indigo-300">GSTIN: {data.company.gstin}</span>}
                {data.company.address && <span className="text-xs text-indigo-300/70 truncate max-w-[300px]">{data.company.address}</span>}
                {data.company.approval_required && (
                  <span className="text-[10px] font-semibold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full">Approval Required</span>
                )}
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Completed Trips', value: String(s.trips),        bg: 'from-blue-500/20 to-blue-600/10' },
              { label: 'Active Now',      value: String(s.active),       bg: 'from-violet-500/20 to-violet-600/10' },
              { label: 'Cancellations',   value: `${s.cancels} (${s.cancelRate}%)`, bg: s.cancelRate > 10 ? 'from-amber-500/20 to-amber-600/10' : 'from-slate-500/20 to-slate-600/10' },
              { label: 'Total Billed',    value: fmt(s.billed),          bg: 'from-indigo-500/20 to-indigo-600/10' },
              { label: 'Collected',       value: fmt(s.collected),       bg: 'from-emerald-500/20 to-emerald-600/10', green: true },
              { label: 'Outstanding',     value: fmt(s.outstanding),     bg: s.outstanding > 0 ? 'from-red-500/25 to-red-600/10' : 'from-slate-500/20 to-slate-600/10', red: s.outstanding > 0 },
            ].map(card => (
              <div key={card.label} className={cn('rounded-xl p-3 bg-gradient-to-br border border-white/10', card.bg)}>
                <div className={cn('text-lg font-bold truncate', (card as {red?: boolean}).red ? 'text-red-300' : (card as {green?: boolean}).green ? 'text-emerald-300' : 'text-white')}>
                  {card.value}
                </div>
                <div className="text-[10px] text-white/50 mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Collection bar ─────────────────────────────────────────── */}
      {s.billed > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Collection Status</h2>
            <span className={cn('text-sm font-bold', collectionRate >= 90 ? 'text-emerald-600' : collectionRate >= 70 ? 'text-amber-600' : 'text-red-600')}>
              {collectionRate}% collected
            </span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${collectionRate}%`, background: collectionRate >= 90 ? 'linear-gradient(to right, #059669, #10b981)' : collectionRate >= 70 ? 'linear-gradient(to right, #d97706, #f59e0b)' : 'linear-gradient(to right, #dc2626, #ef4444)' }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Total billed: <strong className="text-gray-900">{fmtFull(s.billed)}</strong></span>
            <span>Collected: <strong className="text-emerald-700">{fmtFull(s.collected)}</strong></span>
            {s.outstanding > 0 && <span>Outstanding: <strong className="text-red-700">{fmtFull(s.outstanding)}</strong></span>}
          </div>
        </div>
      )}

      {/* ── Charts row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Monthly volume */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Monthly Trip Volume</h2>
          {data.monthlyVolume.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No completed trips in this period</p>
          ) : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.monthlyVolume} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#9CA3AF' }}
                    tickFormatter={m => { const [y,mo] = m.split('-'); return `${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo)]}'${y.slice(2)}` }}
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#6366f1" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Trip type breakdown + top travellers */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-3">Trip Type Breakdown</h2>
            <div className="flex gap-2 flex-wrap">
              {tripTypeEntries.map(([type, count]) => {
                const colors: Record<string, string> = { local: 'bg-blue-50 text-blue-700 border-blue-200', outstation: 'bg-violet-50 text-violet-700 border-violet-200', airport: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                return (
                  <div key={type} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold', colors[type] ?? 'bg-gray-50 text-gray-600 border-gray-200')}>
                    <span className="capitalize">{type}</span>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Top Travellers</h2>
            {data.topTravellers.length === 0 ? (
              <p className="text-xs text-gray-400">No guest data</p>
            ) : (
              <div className="space-y-2">
                {data.topTravellers.slice(0, 5).map((t, i) => (
                  <div key={t.name} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {t.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="font-semibold text-gray-700 truncate">{t.name}</span>
                        <span className="font-bold text-gray-900 shrink-0 ml-2">{t.trips} trips</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full"
                          style={{ width: `${(t.trips / (data.topTravellers[0]?.trips || 1)) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Invoice history ─────────────────────────────────────────── */}
      {data.invoices.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Invoice History</h2>
            <Link href={`/billing/invoices?company_id=${id}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              All invoices <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Invoice #', 'Period', 'Total', 'Balance Due', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/billing/invoices/${inv.id}`} className="font-bold text-indigo-600 hover:underline">
                      {inv.invoice_number ?? 'DRAFT'}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(inv.period_from)} – {fmtDate(inv.period_to)}</td>
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{fmtFull(inv.grand_total)}</td>
                  <td className="px-4 py-2.5 font-bold"
                    style={{ color: inv.balance_due > 0 ? '#dc2626' : '#059669' }}>
                    {inv.balance_due > 0 ? fmtFull(inv.balance_due) : '✓ Paid'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600')}>
                      {inv.status.replace('_',' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Recent bookings ─────────────────────────────────────────── */}
      {data.recentBookings.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Recent Bookings</h2>
            <Link href={`/bookings?company=${encodeURIComponent(data.company.name)}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              All bookings <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                {['Booking Ref', 'Date', 'Guest', 'Driver', 'Trip Type', 'Route', 'Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recentBookings.map((b, idx) => (
                <tr key={b.id} className={cn('hover:bg-indigo-50/30', idx % 2 === 1 ? 'bg-gray-50/40' : '')}>
                  <td className="px-4 py-2.5">
                    <Link href={`/bookings/${b.id}`} className="font-bold text-indigo-600 hover:underline">{b.booking_ref}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{b.pickup_date ? fmtDate(b.pickup_date) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-[120px] truncate">{b.guest_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{b.driver?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 capitalize text-gray-500">{b.trip_type}</td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[160px] truncate text-xs">
                    {b.pickup_location ?? '—'}{b.drop_location ? ` → ${b.drop_location}` : ''}
                  </td>
                  <td className="px-4 py-2.5"><BookingStatusBadge status={b.status as BookingStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
