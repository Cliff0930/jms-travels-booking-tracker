'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Building2, TrendingUp, AlertCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CompanyRow {
  id: string; name: string; gstin: string | null
  trips: number; cancels: number; billed: number; outstanding: number
}

function fmt(n: number) {
  if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L'
  if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K'
  return '₹' + n.toFixed(0)
}

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const DEFAULT_FROM = `${now.getFullYear()}-01-01`
const DEFAULT_TO   = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`

export default function CompaniesAnalyticsPage() {
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM)
  const [dateTo,   setDateTo]   = useState(DEFAULT_TO)

  const { data: companies = [], isLoading } = useQuery<CompanyRow[]>({
    queryKey: ['analytics-companies', dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/company?date_from=${dateFrom}&date_to=${dateTo}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return Array.isArray(json) ? json : []
    },
  })

  const totalBilled      = companies.reduce((s, c) => s + c.billed, 0)
  const totalOutstanding = companies.reduce((s, c) => s + c.outstanding, 0)
  const totalTrips       = companies.reduce((s, c) => s + c.trips, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold text-white">Company Scorecards</h1>
              <p className="text-indigo-300 text-sm mt-0.5">Click any company to view its full scorecard</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
              <span className="text-white/50 text-xs">–</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Companies',  value: String(companies.length),  bg: 'from-blue-500/20 to-blue-600/10' },
              { label: 'Total Billed',     value: fmt(totalBilled),          bg: 'from-emerald-500/20 to-emerald-600/10' },
              { label: 'Total Outstanding',value: fmt(totalOutstanding),     bg: totalOutstanding > 0 ? 'from-red-500/25 to-red-600/10' : 'from-slate-500/20 to-slate-600/10', red: totalOutstanding > 0 },
            ].map(s => (
              <div key={s.label} className={cn('rounded-xl p-4 bg-gradient-to-br border border-white/10', s.bg)}>
                <div className={cn('text-2xl font-bold', (s as {red?: boolean}).red ? 'text-red-300' : 'text-white')}>{s.value}</div>
                <div className="text-xs text-white/50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Company cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : companies.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No company data for this period</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {companies.map((c, i) => {
            const cancelRate = (c.trips + c.cancels) > 0 ? Math.round((c.cancels / (c.trips + c.cancels)) * 100) : 0
            const collectionRate = c.billed > 0 ? Math.round(((c.billed - c.outstanding) / c.billed) * 100) : 0
            const COLORS = ['#6366f1','#8b5cf6','#7c3aed','#4f46e5','#818cf8','#a78bfa']
            const color = COLORS[i % COLORS.length]
            return (
              <button
                key={c.id}
                onClick={() => router.push(`/analytics/companies/${c.id}`)}
                className="bg-white rounded-2xl border border-gray-200 p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: color }}>
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-sm truncate max-w-[160px]">{c.name}</p>
                      {c.gstin && <p className="text-[10px] text-gray-400 font-mono">{c.gstin}</p>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors shrink-0" />
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-lg font-bold text-gray-900">{c.trips}</div>
                    <div className="text-[10px] text-gray-400">Completed trips</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-lg font-bold text-indigo-700">{fmt(c.billed)}</div>
                    <div className="text-[10px] text-gray-400">Total billed</div>
                  </div>
                </div>

                {/* Collection progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>Collection rate</span>
                    <span className={cn('font-semibold', collectionRate >= 90 ? 'text-emerald-600' : collectionRate >= 70 ? 'text-amber-600' : 'text-red-600')}>
                      {collectionRate}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${collectionRate}%`, backgroundColor: collectionRate >= 90 ? '#059669' : collectionRate >= 70 ? '#d97706' : '#dc2626' }} />
                  </div>
                </div>

                {c.outstanding > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] text-red-600 font-semibold">
                    <AlertCircle className="w-3 h-3" /> {fmt(c.outstanding)} outstanding
                  </div>
                )}
                {cancelRate > 10 && (
                  <div className="mt-1 text-[10px] text-amber-600 font-medium">{cancelRate}% cancellation rate</div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
