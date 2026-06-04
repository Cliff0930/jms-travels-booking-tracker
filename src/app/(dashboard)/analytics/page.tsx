'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dynamic from 'next/dynamic'
import { Download, TrendingUp, TrendingDown, Minus, ExternalLink, IndianRupee, Car, Building2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as XLSX from 'xlsx'

const AreaChart     = dynamic(() => import('recharts').then(m => m.AreaChart),     { ssr: false })
const Area          = dynamic(() => import('recharts').then(m => m.Area),          { ssr: false })
const BarChart      = dynamic(() => import('recharts').then(m => m.BarChart),      { ssr: false })
const Bar           = dynamic(() => import('recharts').then(m => m.Bar),           { ssr: false })
const XAxis         = dynamic(() => import('recharts').then(m => m.XAxis),         { ssr: false })
const YAxis         = dynamic(() => import('recharts').then(m => m.YAxis),         { ssr: false })
const Tooltip       = dynamic(() => import('recharts').then(m => m.Tooltip),       { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const Cell          = dynamic(() => import('recharts').then(m => m.Cell),          { ssr: false })

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
}
function fmtFull(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
function trend(curr: number, prev: number) {
  if (!prev) return null
  const pct = Math.round(((curr - prev) / prev) * 100)
  return pct
}

interface Summary {
  billed: number; collected: number; outstanding: number; trips: number; cancels: number
  prev: { billed: number; collected: number; trips: number; cancels: number }
}
interface CompanyRow { name: string; billed: number; collected: number; balance: number; trips: number }
interface DriverRow  { id: string; name: string; trips: number; commission_pct: number }
interface OutstandingRow { id: string; invoice_number: string | null; company: string; grand_total: number; balance_due: number; due_date: string | null; status: string; period_from: string }
interface DailyEntry { date: string; count: number }
interface AnalyticsData {
  period: { from: string; to: string }
  summary: Summary
  byCompany: CompanyRow[]
  byDriver: DriverRow[]
  outstanding: OutstandingRow[]
  dailyVolume: DailyEntry[]
}

const PRESETS = [
  { label: 'This Month', key: 'this_month' },
  { label: 'Last Month', key: 'last_month' },
  { label: 'Last 30 Days', key: 'last_30' },
  { label: 'This Year', key: 'this_year' },
]

function getPresetDates(key: string): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
  const today = fmt(now)
  if (key === 'this_month') return { from: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, to: today }
  if (key === 'last_month') {
    const f = new Date(now.getFullYear(), now.getMonth()-1, 1)
    const t = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: fmt(f), to: fmt(t) }
  }
  if (key === 'last_30') { const d = new Date(now); d.setDate(d.getDate()-29); return { from: fmt(d), to: today } }
  if (key === 'this_year') return { from: `${now.getFullYear()}-01-01`, to: today }
  return { from: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`, to: today }
}

function TrendBadge({ curr, prev }: { curr: number; prev: number }) {
  const pct = trend(curr, prev)
  if (pct === null) return null
  if (pct > 0) return <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-semibold"><TrendingUp className="w-3 h-3"/>+{pct}%</span>
  if (pct < 0) return <span className="flex items-center gap-0.5 text-red-400 text-xs font-semibold"><TrendingDown className="w-3 h-3"/>{pct}%</span>
  return <span className="flex items-center gap-0.5 text-slate-400 text-xs"><Minus className="w-3 h-3"/>0%</span>
}

const COMPANY_COLORS = ['#6366f1','#8b5cf6','#a78bfa','#7c3aed','#4f46e5','#818cf8','#c4b5fd','#ddd6fe']

export default function AnalyticsPage() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const [preset, setPreset] = useState('this_month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const dates = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : getPresetDates(preset)

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ['analytics', dates.from, dates.to],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?date_from=${dates.from}&date_to=${dates.to}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      return json
    },
    enabled: !!(dates.from && dates.to),
  })

  const s = data?.summary
  const maxBilled = Math.max(...(data?.byCompany ?? []).map(c => c.billed), 1)

  function exportExcel() {
    if (!data) return
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byCompany), 'Revenue by Company')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.byDriver),  'Driver Performance')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.outstanding), 'Outstanding Dues')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.dailyVolume), 'Daily Volume')
    XLSX.writeFile(wb, `analytics-${dates.from}-${dates.to}.xlsx`)
  }

  return (
    <div className="space-y-6">

      {/* ── Hero header ───────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Business Analytics</h1>
              <p className="text-indigo-300 text-sm mt-0.5">
                {dates.from && dates.to ? `${fmtDate(dates.from)} — ${fmtDate(dates.to)}` : 'Select a period'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg overflow-hidden border border-white/20">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPreset(p.key)}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold transition-colors border-r border-white/10 last:border-0',
                      preset === p.key ? 'bg-white text-indigo-900' : 'text-white/70 hover:bg-white/10'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setPreset('custom')}
                  className={cn('px-3 py-1.5 text-xs font-semibold', preset === 'custom' ? 'bg-white text-indigo-900' : 'text-white/70 hover:bg-white/10')}
                >
                  Custom
                </button>
              </div>
              {preset === 'custom' && (
                <div className="flex items-center gap-1.5 text-xs text-white/70">
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs" />
                  <span>–</span>
                  <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs" />
                </div>
              )}
              {data && (
                <Button size="sm" variant="outline" onClick={exportExcel} className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" /> Export
                </Button>
              )}
            </div>
          </div>

          {/* Stat cards */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white/10 rounded-xl p-4 h-20 animate-pulse" />
              ))}
            </div>
          ) : s ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Revenue Billed',  value: fmt(s.billed),       sub: fmtFull(s.billed),       icon: IndianRupee, curr: s.billed,       prev: s.prev.billed,    color: 'from-blue-500/20 to-blue-600/10' },
                { label: 'Collected',       value: fmt(s.collected),     sub: fmtFull(s.collected),     icon: CheckCircle2,curr: s.collected,    prev: s.prev.collected, color: 'from-emerald-500/20 to-emerald-600/10' },
                { label: 'Outstanding',     value: fmt(s.outstanding),   sub: fmtFull(s.outstanding),   icon: AlertCircle, curr: 0,              prev: 0,                color: s.outstanding > 0 ? 'from-red-500/30 to-red-600/10' : 'from-emerald-500/20 to-emerald-600/10', redVal: s.outstanding > 0 },
                { label: 'Completed Trips', value: String(s.trips),      sub: `${s.cancels} cancelled`, icon: Car,         curr: s.trips,        prev: s.prev.trips,     color: 'from-violet-500/20 to-violet-600/10' },
                { label: 'Cancellations',   value: String(s.cancels),    sub: s.trips > 0 ? `${Math.round((s.cancels/(s.trips+s.cancels))*100)}% cancel rate` : '', icon: Building2, curr: 0, prev: 0, color: s.cancels > 0 ? 'from-amber-500/20 to-amber-600/10' : 'from-slate-500/20 to-slate-600/10', redVal: s.cancels > 0 },
              ].map(card => (
                <div key={card.label} className={cn('rounded-xl p-4 bg-gradient-to-br border border-white/10', card.color)}>
                  <div className="flex items-center justify-between mb-2">
                    <card.icon className="w-4 h-4 text-white/50" />
                    <TrendBadge curr={card.curr} prev={card.prev} />
                  </div>
                  <div className={cn('text-2xl font-bold', card.redVal ? 'text-red-300' : 'text-white')}>{card.value}</div>
                  <div className="text-xs text-white/50 mt-0.5">{card.label}</div>
                  {card.sub && <div className="text-[10px] text-white/30 mt-0.5 truncate">{card.sub}</div>}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Middle row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Revenue by Company */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Revenue by Company</h2>
              <p className="text-xs text-gray-400 mt-0.5">Billed vs collected this period</p>
            </div>
            <Link href="/billing/invoices" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              All invoices <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : (data?.byCompany ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No invoice data for this period</p>
            ) : (
              (data?.byCompany ?? []).map((c, i) => (
                <div key={c.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700 truncate max-w-[160px]">{c.name}</span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-gray-500">{c.trips} trips</span>
                      {c.balance > 0 && (
                        <span className="text-red-600 font-semibold">₹{(c.balance/1000).toFixed(0)}K due</span>
                      )}
                      <span className="font-bold text-gray-900">{fmt(c.billed)}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full flex">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(c.collected / Math.max(c.billed, 1)) * 100}%`, backgroundColor: COMPANY_COLORS[i % COMPANY_COLORS.length] }}
                      />
                      {c.balance > 0 && (
                        <div
                          className="h-full bg-red-200 transition-all"
                          style={{ width: `${(c.balance / Math.max(c.billed, 1)) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"/> Collected</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-200 inline-block"/> Outstanding</span>
          </div>
        </div>

        {/* Trip Volume Chart */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Trip Volume</h2>
              <p className="text-xs text-gray-400 mt-0.5">Completed trips per day</p>
            </div>
            <Link href="/reports" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              Full report <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-4 h-52">
            {isLoading ? (
              <div className="h-full bg-gray-50 rounded animate-pulse" />
            ) : (data?.dailyVolume ?? []).length === 0 ? (
              <p className="text-sm text-gray-400 text-center pt-16">No completed trips in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.dailyVolume ?? []} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="tripGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9CA3AF' }}
                    tickFormatter={d => { const dt = new Date(d+'T00:00:00'); return `${dt.getDate()}/${dt.getMonth()+1}` }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    labelFormatter={(d: string) => fmtDate(d)}
                  />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#tripGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom row ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Outstanding Dues */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Outstanding Dues</h2>
              <p className="text-xs text-gray-400 mt-0.5">Invoices with unpaid balance</p>
            </div>
            <Link href="/billing/invoices" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              All invoices <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : (data?.outstanding ?? []).length === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-emerald-600">All clear — no outstanding dues!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {(data?.outstanding ?? []).map(inv => {
                const age = inv.due_date
                  ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000)
                  : null
                const ageColor = age === null ? 'text-gray-400' : age > 60 ? 'text-red-600 font-bold' : age > 30 ? 'text-amber-600 font-semibold' : 'text-gray-500'
                return (
                  <Link key={inv.id} href={`/billing/invoices/${inv.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors group">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-indigo-700">{inv.invoice_number ?? 'DRAFT'}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold capitalize',
                          inv.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'
                        )}>{inv.status.replace('_',' ')}</span>
                      </div>
                      <p className="text-xs text-gray-600 truncate mt-0.5">{inv.company}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-sm font-bold text-red-700">{fmt(inv.balance_due)}</div>
                      {age !== null && (
                        <div className={cn('text-[10px]', ageColor)}>
                          {age > 0 ? `${age}d overdue` : age === 0 ? 'Due today' : 'Due soon'}
                        </div>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Driver Performance */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Driver Performance</h2>
              <p className="text-xs text-gray-400 mt-0.5">Completed trips this period</p>
            </div>
            <Link href="/billing/margin" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              Margin detail <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : (data?.byDriver ?? []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">No completed trips in this period</p>
          ) : (
            <div className="p-4 space-y-2">
              {(data?.byDriver ?? []).map((d, i) => {
                const maxTrips = Math.max(...(data?.byDriver ?? []).map(x => x.trips), 1)
                return (
                  <div key={d.id} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: COMPANY_COLORS[i % COMPANY_COLORS.length] }}>
                      {d.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1 text-xs">
                        <span className="font-semibold text-gray-700 truncate max-w-[140px]">{d.name}</span>
                        <span className="font-bold text-gray-900 shrink-0 ml-2">{d.trips} trips</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(d.trips / maxTrips) * 100}%`, backgroundColor: COMPANY_COLORS[i % COMPANY_COLORS.length] }}
                        />
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{d.commission_pct}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          Failed to load analytics: {(error as Error).message}
        </div>
      )}
    </div>
  )
}
