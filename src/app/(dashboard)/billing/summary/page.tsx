'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MonthRow {
  month: string; label: string
  billed: number; collected: number
  driver_payouts: number; advances_given: number; gross_margin: number
}
interface SummaryData {
  year: string
  rows: MonthRow[]
  totals: { billed: number; collected: number; driver_payouts: number; advances_given: number; gross_margin: number }
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]

export default function BillingSummaryPage() {
  const [year, setYear] = useState(String(CURRENT_YEAR))

  const { data, isLoading } = useQuery<SummaryData>({
    queryKey: ['billing-summary', year],
    queryFn: () => fetch(`/api/billing/summary?year=${year}`).then(r => r.json()),
  })

  function exportExcel() {
    if (!data) return
    const rows = [
      ...data.rows.map(r => ({
        'Month': r.label,
        'Billed to Clients (₹)': r.billed,
        'Collected (₹)': r.collected,
        'Driver Payouts (₹)': r.driver_payouts,
        'Advances Given (₹)': r.advances_given,
        'Gross Margin (₹)': r.gross_margin,
      })),
      {
        'Month': 'TOTAL',
        'Billed to Clients (₹)': data.totals.billed,
        'Collected (₹)': data.totals.collected,
        'Driver Payouts (₹)': data.totals.driver_payouts,
        'Advances Given (₹)': data.totals.advances_given,
        'Gross Margin (₹)': data.totals.gross_margin,
      },
    ]
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `P&L ${year}`)
    XLSX.writeFile(wb, `pnl-summary-${year}.xlsx`)
  }

  const activeMonths = data?.rows.filter(r => r.billed > 0 || r.driver_payouts > 0) ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="P&L Summary"
        description="Monthly billing vs driver payouts and gross margin"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {YEARS.map(y => (
                <button key={y} onClick={() => setYear(String(y))}
                  className={cn('px-3 py-2 font-semibold transition-colors', String(y) === year ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
                >{y}</button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
              <Download className="w-3.5 h-3.5" />Excel
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[
            { label: 'Total Billed', value: fmt(data.totals.billed) },
            { label: 'Total Collected', value: fmt(data.totals.collected) },
            { label: 'Driver Payouts', value: fmt(data.totals.driver_payouts), red: true },
            { label: 'Advances Given', value: fmt(data.totals.advances_given), amber: true },
            { label: 'Gross Margin', value: fmt(data.totals.gross_margin), highlight: true },
          ].map(c => (
            <div key={c.label} className={cn('rounded-xl border p-4', c.highlight ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-200')}>
              <div className={cn('text-xs font-medium mb-1', c.highlight ? 'text-blue-200' : 'text-gray-500')}>{c.label}</div>
              <div className={cn('text-lg font-bold', c.highlight ? 'text-white' : (c as {red?: boolean}).red ? 'text-red-600' : (c as {amber?: boolean}).amber ? 'text-amber-600' : 'text-gray-900')}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Month-by-Month Breakdown — {year}</h2>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Month', 'Billed to Clients', 'Collected', 'Driver Payouts', 'Advances Given', 'Gross Margin'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.rows.map((r, i) => {
                  const isEmpty = r.billed === 0 && r.driver_payouts === 0 && r.collected === 0
                  return (
                    <tr key={r.month} className={cn('hover:bg-gray-50', isEmpty ? 'opacity-40' : '', i % 2 === 1 ? 'bg-gray-50/50' : '')}>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{r.label}</td>
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{r.billed > 0 ? fmt(r.billed) : '—'}</td>
                      <td className="px-4 py-3 text-green-700 whitespace-nowrap">{r.collected > 0 ? fmt(r.collected) : '—'}</td>
                      <td className="px-4 py-3 text-red-600 whitespace-nowrap">{r.driver_payouts > 0 ? fmt(r.driver_payouts) : '—'}</td>
                      <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{r.advances_given > 0 ? fmt(r.advances_given) : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.billed > 0 && (
                          <span className={cn('font-bold', r.gross_margin >= 0 ? 'text-blue-700' : 'text-red-600')}>
                            {fmt(r.gross_margin)}
                          </span>
                        )}
                        {r.billed === 0 && '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {data && (
                <tfoot className="bg-gray-50 border-t-2 border-gray-800">
                  <tr>
                    <td className="px-4 py-3 font-bold text-gray-900">TOTAL {year}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{fmt(data.totals.billed)}</td>
                    <td className="px-4 py-3 font-bold text-green-700">{fmt(data.totals.collected)}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{fmt(data.totals.driver_payouts)}</td>
                    <td className="px-4 py-3 font-bold text-amber-600">{fmt(data.totals.advances_given)}</td>
                    <td className="px-4 py-3 font-bold text-blue-700">{fmt(data.totals.gross_margin)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {activeMonths.length > 0 && data && (
        <p className="text-xs text-gray-400 text-right">
          Margin % = {Math.round((data.totals.gross_margin / data.totals.billed) * 100)}% of billed revenue
          {' · '}Gross margin = Billed − Driver Payouts (before GST, advances, overheads)
        </p>
      )}
    </div>
  )
}
