'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'

interface MarginRow {
  id: string; trip_date: string; booking_ref: string; guest_name: string | null
  company_name: string; invoice_number: string | null; driver_name: string
  commission_pct: number; hire_charges: number; driver_hire_cost: number
  company_hire_margin: number; bata_billed: number; bata_paid: number; bata_profit: number
  reimb_billed: number; reimb_paid: number; reimb_profit: number
  line_total: number; total_margin: number; margin_pct: number; trip_type: string
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function SummaryCard({ label, value, sub, red, green }: { label: string; value: string; sub?: string; red?: boolean; green?: boolean }) {
  return (
    <div className={cn('rounded-xl border p-4', red ? 'bg-red-50 border-red-200' : green ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200')}>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className={cn('text-xl font-bold', red ? 'text-red-700' : green ? 'text-green-700' : 'text-gray-900')}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function MarginTrackerPage() {
  const currentYear = new Date().getFullYear()
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`)
  const [dateTo,   setDateTo]   = useState(`${currentYear}-12-31`)
  const [companyFilter, setCompanyFilter] = useState('all')
  const [showNegOnly, setShowNegOnly] = useState(false)

  const { data: rows = [], isLoading } = useQuery<MarginRow[]>({
    queryKey: ['billing-margin', dateFrom, dateTo],
    queryFn: () => {
      const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
      return fetch(`/api/billing/margin?${p}`).then(r => r.json())
    },
  })

  const companies = useMemo(() => {
    const seen = new Map<string, string>()
    rows.forEach(r => { if (r.company_name && r.company_name !== '—') seen.set(r.company_name, r.company_name) })
    return Array.from(seen.keys()).sort()
  }, [rows])

  const filtered = rows.filter(r => {
    if (companyFilter !== 'all' && r.company_name !== companyFilter) return false
    if (showNegOnly && r.total_margin >= 0) return false
    return true
  })

  const totals = useMemo(() => {
    const t = { hire: 0, driver_cost: 0, hire_margin: 0, bata_profit: 0, reimb_profit: 0, total_margin: 0, billed: 0 }
    for (const r of filtered) {
      t.hire         += r.hire_charges
      t.driver_cost  += r.driver_hire_cost
      t.hire_margin  += r.company_hire_margin
      t.bata_profit  += r.bata_profit
      t.reimb_profit += r.reimb_profit
      t.total_margin += r.total_margin
      t.billed       += r.line_total
    }
    return t
  }, [filtered])

  const avgMarginPct = totals.hire > 0 ? Math.round((totals.total_margin / totals.hire) * 100) : 0
  const negCount = rows.filter(r => r.total_margin < 0).length

  function exportExcel() {
    const data = filtered.map(r => ({
      'Date':            r.trip_date,
      'Booking Ref':     r.booking_ref,
      'Guest':           r.guest_name ?? '',
      'Company':         r.company_name,
      'Invoice #':       r.invoice_number ?? '',
      'Driver':          r.driver_name,
      'Commission %':    r.commission_pct,
      'Hire Billed (₹)': r.hire_charges,
      'Driver Hire Cost (₹)': r.driver_hire_cost,
      'Hire Margin (₹)': r.company_hire_margin,
      'Bata Billed (₹)': r.bata_billed,
      'Bata Paid (₹)':   r.bata_paid,
      'Bata Profit (₹)': r.bata_profit,
      'Reimb Billed (₹)': r.reimb_billed,
      'Reimb Paid (₹)':  r.reimb_paid,
      'Reimb Profit (₹)': r.reimb_profit,
      'Total Margin (₹)': r.total_margin,
      'Margin %':        r.margin_pct,
      'Total Billed incl GST (₹)': r.line_total,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Margin Tracker')
    XLSX.writeFile(wb, `margin-tracker-${dateFrom}-to-${dateTo}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        title="Margin Tracker"
        description="Per-trip profitability — hire margin, bata profit, reimbursement spread"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span>Period:</span>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 text-xs border-[#C3C5D7]" />
          <span>–</span>
          <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 w-36 text-xs border-[#C3C5D7]" />
        </div>

        <Select value={companyFilter} onValueChange={v => v !== null && setCompanyFilter(v)}>
          <SelectTrigger className="h-8 w-44 text-xs border-[#C3C5D7]"><SelectValue placeholder="All Companies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <button
          onClick={() => setShowNegOnly(v => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-semibold border transition-colors',
            showNegOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300 hover:border-red-300 hover:text-red-600'
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          Loss trips {negCount > 0 && <span className={cn('ml-0.5 px-1.5 rounded-full text-[10px]', showNegOnly ? 'bg-white/20' : 'bg-red-100 text-red-700')}>{negCount}</span>}
        </button>

        <div className="ml-auto flex items-center gap-2">
          {filtered.length > 0 && (
            <Button size="sm" variant="outline" onClick={exportExcel} className="h-8 text-xs gap-1.5 border-[#C3C5D7]">
              <Download className="w-3.5 h-3.5" /> Export Excel
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-5">
          <SummaryCard label="Trips" value={String(filtered.length)} />
          <SummaryCard label="Hire Billed" value={fmt(totals.hire)} />
          <SummaryCard label="Driver Hire Cost" value={fmt(totals.driver_cost)} red />
          <SummaryCard label="Hire Margin" value={fmt(totals.hire_margin)} green />
          <SummaryCard label="Total Margin" value={fmt(totals.total_margin)} green={totals.total_margin >= 0} red={totals.total_margin < 0} sub={`Avg ${avgMarginPct}%`} />
          <SummaryCard label="Total Billed (incl GST)" value={fmt(totals.billed)} />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          {showNegOnly ? 'No loss trips in this period.' : 'No invoiced trips found for this period.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date','Booking','Guest','Company','Invoice','Driver','Comm %',
                  'Hire Billed','Driver Cost','Hire Margin',
                  'Bata Billed','Bata Paid','Bata Profit',
                  'Reimb Billed','Reimb Paid','Reimb Profit',
                  'Total Margin','Margin %'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(r => {
                const isLoss = r.total_margin < 0
                const isLow  = r.margin_pct > 0 && r.margin_pct < 10
                return (
                  <tr key={r.id} className={cn(
                    'hover:bg-gray-50',
                    isLoss ? 'bg-red-50/60' : ''
                  )}>
                    <td className="px-3 py-2">{fmtDate(r.trip_date)}</td>
                    <td className="px-3 py-2 font-medium text-blue-700">{r.booking_ref}</td>
                    <td className="px-3 py-2 max-w-[100px] truncate text-gray-600">{r.guest_name ?? '—'}</td>
                    <td className="px-3 py-2 max-w-[110px] truncate font-medium">{r.company_name}</td>
                    <td className="px-3 py-2 text-gray-500">{r.invoice_number ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.driver_name}</td>
                    <td className="px-3 py-2 text-center text-gray-500">{r.commission_pct}%</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(r.hire_charges)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(r.driver_hire_cost)}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-medium">{fmt(r.company_hire_margin)}</td>
                    <td className="px-3 py-2 text-right">{r.bata_billed > 0 ? fmt(r.bata_billed) : '—'}</td>
                    <td className="px-3 py-2 text-right text-red-500">{r.bata_paid > 0 ? fmt(r.bata_paid) : '—'}</td>
                    <td className={cn('px-3 py-2 text-right font-medium', r.bata_profit < 0 ? 'text-red-600' : r.bata_profit > 0 ? 'text-green-600' : 'text-gray-400')}>
                      {r.bata_billed > 0 || r.bata_paid > 0 ? fmt(r.bata_profit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">{r.reimb_billed > 0 ? fmt(r.reimb_billed) : '—'}</td>
                    <td className="px-3 py-2 text-right text-red-500">{r.reimb_paid > 0 ? fmt(r.reimb_paid) : '—'}</td>
                    <td className={cn('px-3 py-2 text-right font-medium', r.reimb_profit < 0 ? 'text-red-600' : r.reimb_profit > 0 ? 'text-green-600' : 'text-gray-400')}>
                      {r.reimb_billed > 0 || r.reimb_paid > 0 ? fmt(r.reimb_profit) : '—'}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-bold text-sm', isLoss ? 'text-red-700' : 'text-green-700')}>
                      {isLoss && <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                      {!isLoss && <TrendingUp className="w-3 h-3 inline mr-0.5" />}
                      {fmt(r.total_margin)}
                    </td>
                    <td className={cn('px-3 py-2 text-right font-semibold', isLoss ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-green-600')}>
                      {r.margin_pct}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-300">
              <tr>
                <td colSpan={7} className="px-3 py-2.5 font-bold text-gray-700">TOTAL ({filtered.length} trips)</td>
                <td className="px-3 py-2.5 text-right font-bold">{fmt(totals.hire)}</td>
                <td className="px-3 py-2.5 text-right font-bold text-red-600">{fmt(totals.driver_cost)}</td>
                <td className="px-3 py-2.5 text-right font-bold text-green-700">{fmt(totals.hire_margin)}</td>
                <td className="px-3 py-2.5 text-right font-bold">{fmt(filtered.reduce((s,r) => s + r.bata_billed, 0))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-red-500">{fmt(filtered.reduce((s,r) => s + r.bata_paid, 0))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-green-600">{fmt(totals.bata_profit)}</td>
                <td className="px-3 py-2.5 text-right font-bold">{fmt(filtered.reduce((s,r) => s + r.reimb_billed, 0))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-red-500">{fmt(filtered.reduce((s,r) => s + r.reimb_paid, 0))}</td>
                <td className="px-3 py-2.5 text-right font-bold text-green-600">{fmt(totals.reimb_profit)}</td>
                <td className={cn('px-3 py-2.5 text-right font-bold text-base', totals.total_margin < 0 ? 'text-red-700' : 'text-green-700')}>
                  {fmt(totals.total_margin)}
                </td>
                <td className={cn('px-3 py-2.5 text-right font-bold', totals.total_margin < 0 ? 'text-red-600' : 'text-green-600')}>
                  {avgMarginPct}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        * Driver cost is estimated using driver&apos;s default commission % and bata rate. Actual cost may differ if company-specific bata rates apply.
        Reimbursements use driver-adjusted values from tripsheets where available.
      </p>
    </div>
  )
}
