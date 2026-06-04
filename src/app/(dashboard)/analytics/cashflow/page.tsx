'use client'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Download, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'

const ComposedChart    = dynamic(() => import('recharts').then(m => m.ComposedChart),    { ssr: false })
const Bar              = dynamic(() => import('recharts').then(m => m.Bar),              { ssr: false })
const Line             = dynamic(() => import('recharts').then(m => m.Line),             { ssr: false })
const XAxis            = dynamic(() => import('recharts').then(m => m.XAxis),            { ssr: false })
const YAxis            = dynamic(() => import('recharts').then(m => m.YAxis),            { ssr: false })
const Tooltip          = dynamic(() => import('recharts').then(m => m.Tooltip),          { ssr: false })
const Legend           = dynamic(() => import('recharts').then(m => m.Legend),           { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

interface WeekRow {
  weekStart: string; label: string
  inflow: number; outflow: number; settlements: number; advances: number; net: number
}
interface CashFlowData {
  period: { from: string; to: string }
  weeks: WeekRow[]
  totals: { inflow: number; outflow: number; settlements: number; advances: number; net: number }
}

function fmt(n: number) {
  if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (Math.abs(n) >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
}
function fmtFull(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 })
}
function fmtDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

const PRESETS = [
  { label: 'Last 4 weeks',  days: 28 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'This year',     days: -1 },
]

function buildUrl(preset: number, customFrom: string, customTo: string) {
  const now = new Date()
  let from: string, to = fmtDate(now)
  if (preset === -1) {
    from = `${now.getFullYear()}-01-01`
  } else if (preset > 0) {
    const d = new Date(now); d.setDate(d.getDate() - preset)
    from = fmtDate(d)
  } else {
    from = customFrom; to = customTo
  }
  return `/api/analytics/cashflow?date_from=${from}&date_to=${to}`
}

export default function CashFlowPage() {
  const [preset, setPreset]       = useState(90)
  const [customFrom, setFrom]     = useState('')
  const [customTo, setTo]         = useState('')
  const [useCustom, setUseCustom] = useState(false)

  const url = useCustom && customFrom && customTo
    ? `/api/analytics/cashflow?date_from=${customFrom}&date_to=${customTo}`
    : buildUrl(preset, customFrom, customTo)

  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ['cashflow', url],
    queryFn: () => fetch(url).then(r => r.json()),
  })

  const weeks = data?.weeks ?? []
  const totals = data?.totals

  // Shorten labels for chart when many weeks
  const chartData = useMemo(() => weeks.map(w => ({
    ...w,
    shortLabel: w.label.split('–')[0].trim(),
  })), [weeks])

  function exportXlsx() {
    const rows = weeks.map(w => ({
      'Week':          w.label,
      'Money In':      w.inflow,
      'Settlements':   w.settlements,
      'Advances':      w.advances,
      'Total Out':     w.outflow,
      'Net':           w.net,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Flow')
    XLSX.writeFile(wb, `cash-flow-${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Cash Flow Statement</h1>
          <p className="text-sm text-gray-500 mt-0.5">Week-by-week money in vs money out</p>
        </div>
        <button
          onClick={exportXlsx}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Period controls */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(p => (
          <button
            key={p.days}
            onClick={() => { setPreset(p.days); setUseCustom(false) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors',
              !useCustom && preset === p.days
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-2">
          <input type="date" value={customFrom} onChange={e => { setFrom(e.target.value); setUseCustom(true) }}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={customTo} onChange={e => { setTo(e.target.value); setUseCustom(true) }}
            className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <SummaryCard label="Total In" value={totals.inflow} color="text-emerald-700" bg="bg-emerald-50" border="border-emerald-200" />
          <SummaryCard label="Total Out" value={totals.outflow} color="text-red-700" bg="bg-red-50" border="border-red-200" />
          <SummaryCard label="Net Position" value={totals.net} color={totals.net >= 0 ? 'text-blue-700' : 'text-red-700'} bg={totals.net >= 0 ? 'bg-blue-50' : 'bg-red-50'} border={totals.net >= 0 ? 'border-blue-200' : 'border-red-200'} showTrend />
          <SummaryCard label="Driver Payouts" value={totals.settlements} color="text-orange-700" bg="bg-orange-50" border="border-orange-200" />
          <SummaryCard label="Advances Given" value={totals.advances} color="text-purple-700" bg="bg-purple-50" border="border-purple-200" />
        </div>
      )}

      {/* Chart */}
      {weeks.length === 0 ? (
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No data for this period.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Weekly cash movement</p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="shortLabel" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={56} />
              <Tooltip
                formatter={(value: unknown, name: string) => [fmtFull(Number(value ?? 0)), name]}
                labelStyle={{ fontWeight: 700, fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="inflow"      name="Money In"       fill="#10b981" radius={[3,3,0,0]} maxBarSize={32} />
              <Bar dataKey="settlements" name="Driver Payouts" fill="#f97316" radius={[3,3,0,0]} maxBarSize={32} stackId="out" />
              <Bar dataKey="advances"    name="Advances"       fill="#a855f7" radius={[3,3,0,0]} maxBarSize={32} stackId="out" />
              <Line dataKey="net" name="Net" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Week-by-week table */}
      {weeks.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Week', 'Money In', 'Driver Payouts', 'Advances', 'Total Out', 'Net'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-500 whitespace-nowrap text-xs uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...weeks].reverse().map(w => (
                <tr key={w.weekStart} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{w.label}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700 whitespace-nowrap text-right">{fmtFull(w.inflow)}</td>
                  <td className="px-4 py-3 text-orange-700 whitespace-nowrap text-right">{fmtFull(w.settlements)}</td>
                  <td className="px-4 py-3 text-purple-700 whitespace-nowrap text-right">{fmtFull(w.advances)}</td>
                  <td className="px-4 py-3 text-red-700 whitespace-nowrap text-right">{fmtFull(w.outflow)}</td>
                  <td className={cn('px-4 py-3 font-bold whitespace-nowrap text-right', w.net >= 0 ? 'text-blue-700' : 'text-red-700')}>
                    {w.net >= 0 ? '+' : ''}{fmtFull(w.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              {totals && (
                <tr>
                  <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">Total</td>
                  <td className="px-4 py-3 font-bold text-emerald-700 text-right">{fmtFull(totals.inflow)}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 text-right">{fmtFull(totals.settlements)}</td>
                  <td className="px-4 py-3 font-bold text-purple-700 text-right">{fmtFull(totals.advances)}</td>
                  <td className="px-4 py-3 font-bold text-red-700 text-right">{fmtFull(totals.outflow)}</td>
                  <td className={cn('px-4 py-3 font-black text-right', totals.net >= 0 ? 'text-blue-700' : 'text-red-700')}>
                    {totals.net >= 0 ? '+' : ''}{fmtFull(totals.net)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, bg, border, showTrend }: {
  label: string; value: number; color: string; bg: string; border: string; showTrend?: boolean
}) {
  return (
    <div className={cn('rounded-xl border p-4 flex flex-col gap-1', bg, border)}>
      <span className={cn('text-xs font-semibold uppercase tracking-wide', color)}>{label}</span>
      <span className={cn('text-xl font-black', color)}>{fmtFull(value)}</span>
      {showTrend && (
        <span className={cn('flex items-center gap-1 text-xs font-medium', color)}>
          {value > 0 ? <TrendingUp className="w-3 h-3" /> : value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          {value > 0 ? 'Positive' : value < 0 ? 'Negative' : 'Break-even'}
        </span>
      )}
    </div>
  )
}
