'use client'
import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Phone, Download, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import type { BookingStatus } from '@/types'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'

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
  driver: { id: string; name: string; phone: string; secondary_phone: string | null; vehicle_name: string; vehicle_number: string; vehicle_type: string; commission_percent: number | null; bata_rate: number | null; driver_type: string | null; status: string }
  period: { from: string; to: string }
  summary: { trips: number; cancelled: number; active: number; totalHire: number; commission: number; companyMargin: number; bata: number; reimbs: number; totalEarnings: number; advancesOut: number; commissionPct: number }
  monthlyVolume: { month: string; count: number }[]
  companiesServed: { name: string; trips: number }[]
  advances: { id: string; amount: number; type: string; status: string; created_at: string; notes: string | null }[]
  settlements: { id: string; ref_number: string | null; period_from: string; period_to: string; net_payable: number; status: string; paid_at: string | null }[]
  recentBookings: { id: string; booking_ref: string; status: string; pickup_date: string | null; trip_type: string; guest_name: string | null; pickup_location: string | null; drop_location: string | null; company?: { name?: string } | null }[]
}

const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const COLORS = ['#6366f1','#8b5cf6','#7c3aed','#4f46e5','#818cf8','#a78bfa']

export default function DriverScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [dateFrom, setDateFrom] = useState(`${now.getFullYear()}-01-01`)
  const [dateTo,   setDateTo]   = useState(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`)

  const { data, isLoading, error } = useQuery<Scorecard>({
    queryKey: ['driver-scorecard', id, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/driver?driver_id=${id}&date_from=${dateFrom}&date_to=${dateTo}`)
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
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.companiesServed), 'Companies')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.advances), 'Advances')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.recentBookings.map(b => ({
      'Booking Ref': b.booking_ref, 'Date': b.pickup_date, 'Status': b.status,
      'Trip Type': b.trip_type, 'Guest': b.guest_name, 'Company': (b.company as { name?: string } | null)?.name,
      'Pickup': b.pickup_location, 'Drop': b.drop_location,
    }))), 'Trips')
    XLSX.writeFile(wb, `driver-${data.driver.name.replace(/\s+/g, '-')}.xlsx`)
  }

  if (isLoading) return (
    <div className="space-y-5">
      <div className="h-52 rounded-2xl bg-gradient-to-br from-[#1e1b4b] to-[#4c1d95] animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
      </div>
    </div>
  )

  if (error || !data) return <div className="py-16 text-center text-gray-400">Failed to load driver scorecard</div>

  const d = data.driver
  const s = data.summary
  const maxTrips = Math.max(...data.companiesServed.map(c => c.trips), 1)

  return (
    <div className="space-y-5">

      {/* ── Hero header ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95]">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/analytics/drivers')}
                className="flex items-center gap-1 text-indigo-300 hover:text-white text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> Drivers
              </button>
              <span className="text-white/20">/</span>
              <span className="text-white text-sm font-semibold">{d.name}</span>
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

          {/* Driver identity */}
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-xl shrink-0">
              {d.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{d.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-indigo-300 text-xs">
                  <Phone className="w-3 h-3" /> {d.phone}
                  {d.secondary_phone && <span className="text-indigo-400"> / {d.secondary_phone}</span>}
                </span>
                <span className="text-xs font-mono text-indigo-300">{d.vehicle_name} · {d.vehicle_number}</span>
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize',
                  d.status === 'available' ? 'bg-emerald-400/20 text-emerald-300' :
                  d.status === 'on_duty'   ? 'bg-blue-400/20 text-blue-300' : 'bg-gray-400/20 text-gray-300')}>
                  {d.status.replace('_',' ')}
                </span>
                {d.driver_type && (
                  <span className="text-[10px] font-semibold bg-white/15 text-white/80 px-2 py-0.5 rounded-full capitalize">{d.driver_type}</span>
                )}
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Trips Done',     value: String(s.trips),        bg: 'from-blue-500/20 to-blue-600/10' },
              { label: 'Active Now',     value: String(s.active),       bg: 'from-violet-500/20 to-violet-600/10' },
              { label: 'Revenue Gen.',   value: fmt(s.totalHire),       bg: 'from-indigo-500/20 to-indigo-600/10' },
              { label: `Earnings (${s.commissionPct}% of hire)`, value: fmt(s.commission), bg: 'from-emerald-500/20 to-emerald-600/10', green: true },
              { label: 'Bata + Reimbs',  value: fmt(s.bata + s.reimbs), bg: 'from-teal-500/20 to-teal-600/10' },
              { label: 'Advances Due',   value: fmt(s.advancesOut),     bg: s.advancesOut > 0 ? 'from-red-500/25 to-red-600/10' : 'from-slate-500/20 to-slate-600/10', red: s.advancesOut > 0 },
            ].map(card => (
              <div key={card.label} className={cn('rounded-xl p-3 bg-gradient-to-br border border-white/10', card.bg)}>
                <div className={cn('text-lg font-bold', (card as {red?: boolean}).red ? 'text-red-300' : (card as {green?: boolean}).green ? 'text-emerald-300' : 'text-white')}>
                  {card.value}
                </div>
                <div className="text-[10px] text-white/50 mt-0.5 leading-tight">{card.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Earnings breakdown ──────────────────────────────────────── */}
      {s.totalHire > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Earnings Breakdown</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Revenue Generated',  value: fmtFull(s.totalHire),   sub: 'Billed to clients',         color: 'text-indigo-700',  bg: 'bg-indigo-50' },
              { label: 'Driver Commission',  value: fmtFull(s.commission),  sub: `${100 - s.commissionPct}% of hire`, color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Bata Earned',        value: fmtFull(s.bata),        sub: 'Night/early bata',           color: 'text-violet-700',  bg: 'bg-violet-50' },
              { label: 'Reimbursements',     value: fmtFull(s.reimbs),      sub: 'Toll + Parking + Permit',    color: 'text-blue-700',    bg: 'bg-blue-50' },
            ].map(row => (
              <div key={row.label} className={cn('rounded-xl p-4', row.bg)}>
                <div className={cn('text-xl font-bold', row.color)}>{row.value}</div>
                <div className="text-xs font-semibold text-gray-700 mt-1">{row.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{row.sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">Total Driver Earnings</span>
              <span className="ml-3 text-xl font-bold text-gray-900">{fmtFull(s.totalEarnings)}</span>
            </div>
            <div className="text-right">
              <span className="text-sm text-gray-500">Company Margin (hire)</span>
              <span className="ml-3 text-lg font-bold text-indigo-700">{fmtFull(s.companyMargin)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Charts row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Monthly volume */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Monthly Trips</h2>
          {data.monthlyVolume.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No trips in this period</p>
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

        {/* Companies served */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-4">Companies Served</h2>
          {data.companiesServed.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No company data</p>
          ) : (
            <div className="space-y-3">
              {data.companiesServed.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                    {c.name.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-700 truncate">{c.name}</span>
                      <span className="font-bold text-gray-900 shrink-0 ml-2">{c.trips}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.trips / maxTrips) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Advances & Settlements ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Advances */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Advance History</h2>
            <Link href={`/advances?driver_id=${id}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              Full ledger <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          {data.advances.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No advance records</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.advances.slice(0, 6).map(a => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-gray-700 capitalize">{a.type}</div>
                    <div className="text-[10px] text-gray-400">{new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</div>
                    {a.notes && <div className="text-[10px] text-gray-400 truncate max-w-[180px]">{a.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-800">{fmtFull(a.amount)}</div>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', a.status === 'outstanding' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
                      {a.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Settlements */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">Settlement History</h2>
            <Link href="/billing/driver-settlements" className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5">
              All statements <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
          {data.settlements.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No settlements yet</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.settlements.map(s => (
                <Link key={s.id} href={`/billing/driver-settlements/${s.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <div className="text-xs font-bold text-indigo-700">{s.ref_number ?? 'Draft'}</div>
                    <div className="text-[10px] text-gray-400">{fmtDate(s.period_from)} – {fmtDate(s.period_to)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-800">{fmtFull(s.net_payable)}</div>
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize', s.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                      {s.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent trips ─────────────────────────────────────────────── */}
      {data.recentBookings.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">Recent Trips</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                {['Booking Ref','Date','Trip Type','Guest','Company','Route','Status'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recentBookings.map((b, idx) => (
                <tr key={b.id} className={cn('hover:bg-indigo-50/30 transition-colors', idx % 2 === 1 ? 'bg-gray-50/40' : '')}>
                  <td className="px-4 py-2.5">
                    <Link href={`/bookings/${b.id}`} className="font-bold text-indigo-600 hover:underline">{b.booking_ref}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{b.pickup_date ? fmtDate(b.pickup_date) : '—'}</td>
                  <td className="px-4 py-2.5 capitalize text-gray-500">{b.trip_type}</td>
                  <td className="px-4 py-2.5 text-gray-600 max-w-[120px] truncate">{b.guest_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500 max-w-[110px] truncate">{(b.company as { name?: string } | null)?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[160px] truncate">{b.pickup_location ?? '—'}{b.drop_location ? ` → ${b.drop_location}` : ''}</td>
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
