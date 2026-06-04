'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Car, ChevronRight, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DriverRow {
  id: string; name: string; phone: string; vehicle_name: string
  vehicle_number: string; vehicle_type: string; commission_percent: number | null
  driver_type: string | null; status: string; trips: number; active: number; advances_outstanding: number
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

const COLORS = ['#6366f1','#8b5cf6','#7c3aed','#4f46e5','#818cf8','#a78bfa','#059669','#0891b2']

export default function DriversAnalyticsPage() {
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM)
  const [dateTo,   setDateTo]   = useState(DEFAULT_TO)

  const { data: drivers = [], isLoading } = useQuery<DriverRow[]>({
    queryKey: ['analytics-drivers', dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/driver?date_from=${dateFrom}&date_to=${dateTo}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return Array.isArray(json) ? json : []
    },
  })

  const totalTrips    = drivers.reduce((s, d) => s + d.trips, 0)
  const totalAdvances = drivers.reduce((s, d) => s + d.advances_outstanding, 0)
  const activeDrivers = drivers.filter(d => d.active > 0).length

  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-bold text-white">Driver Reports</h1>
              <p className="text-indigo-300 text-sm mt-0.5">Click any driver to view their full performance scorecard</p>
            </div>
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
              <span className="text-white/50 text-xs">–</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Active Drivers',      value: String(activeDrivers),   bg: 'from-violet-500/20 to-violet-600/10' },
              { label: 'Total Trips',         value: String(totalTrips),      bg: 'from-blue-500/20 to-blue-600/10' },
              { label: 'Advances Outstanding',value: fmt(totalAdvances),      bg: totalAdvances > 0 ? 'from-red-500/25 to-red-600/10' : 'from-slate-500/20 to-slate-600/10', red: totalAdvances > 0 },
            ].map(s => (
              <div key={s.label} className={cn('rounded-xl p-4 bg-gradient-to-br border border-white/10', s.bg)}>
                <div className={cn('text-2xl font-bold', (s as {red?: boolean}).red ? 'text-red-300' : 'text-white')}>{s.value}</div>
                <div className="text-xs text-white/50 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 bg-gray-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : drivers.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No driver data for this period</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((d, i) => (
            <button
              key={d.id}
              onClick={() => router.push(`/analytics/drivers/${d.id}`)}
              className="bg-white rounded-2xl border border-gray-200 p-5 text-left hover:border-indigo-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                    {d.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{d.name}</p>
                    <p className="text-xs text-gray-400">{d.vehicle_name} · {d.vehicle_number}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors shrink-0" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-gray-900">{d.trips}</div>
                  <div className="text-[10px] text-gray-400">Trips</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-indigo-600">{d.commission_percent ?? 20}%</div>
                  <div className="text-[10px] text-gray-400">Commission</div>
                </div>
                <div className={cn('rounded-lg p-2 text-center', d.active > 0 ? 'bg-emerald-50' : 'bg-gray-50')}>
                  <div className={cn('text-lg font-bold', d.active > 0 ? 'text-emerald-600' : 'text-gray-400')}>{d.active}</div>
                  <div className="text-[10px] text-gray-400">Active now</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className={cn('px-2 py-0.5 rounded-full font-semibold capitalize',
                  d.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                  d.status === 'on_duty'   ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500')}>
                  {d.status.replace('_',' ')}
                </span>
                {d.advances_outstanding > 0 && (
                  <span className="flex items-center gap-1 text-red-600 font-semibold">
                    <AlertCircle className="w-3 h-3" /> {fmt(d.advances_outstanding)} advance
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
