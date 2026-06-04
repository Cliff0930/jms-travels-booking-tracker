'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Download, ChevronDown, ChevronRight, ExternalLink, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as XLSX from 'xlsx'

interface InvoiceRow {
  id: string; invoice_number: string | null; company_id: string; company_name: string
  period_from: string; period_to: string; gross_billed: number; tds_amount: number
  net_received: number; effective_rate: number; status: string
}
interface CompanyRow {
  company_id: string; company_name: string; invoice_count: number
  gross_billed: number; tds_amount: number; net_received: number
  effective_rate: number; invoices: InvoiceRow[]
}
interface TDSData {
  fy: string; fyLabel: string
  fyOptions: { value: string; label: string }[]
  totals: { invoice_count: number; gross_billed: number; tds_amount: number; net_received: number }
  byCompany: CompanyRow[]
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtPeriod(from: string, to: string) {
  const f = new Date(from + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const t = new Date(to   + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f} – ${t}`
}

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
  partially_paid: 'bg-yellow-50 text-yellow-700',
  overdue: 'bg-red-50 text-red-700',
}

export default function TDSReportPage() {
  const [fy, setFY] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const url = `/api/analytics/tds${fy ? `?fy=${fy}` : ''}`
  const { data, isLoading } = useQuery<TDSData>({
    queryKey: ['tds', fy],
    queryFn: () => fetch(url).then(r => r.json()),
  })

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exportXlsx() {
    if (!data) return
    const rows: Record<string, unknown>[] = []
    for (const c of data.byCompany) {
      for (const inv of c.invoices) {
        rows.push({
          'Company':        c.company_name,
          'Invoice #':      inv.invoice_number ?? '',
          'Period':         fmtPeriod(inv.period_from, inv.period_to),
          'Gross Billed':   inv.gross_billed,
          'TDS Deducted':   inv.tds_amount,
          'Net Received':   inv.net_received,
          'TDS Rate %':     inv.effective_rate,
          'Status':         inv.status,
        })
      }
      rows.push({
        'Company': `SUBTOTAL — ${c.company_name}`,
        'Invoice #': `${c.invoice_count} invoices`,
        'Period': '',
        'Gross Billed': c.gross_billed,
        'TDS Deducted': c.tds_amount,
        'Net Received': c.net_received,
        'TDS Rate %': c.effective_rate,
        'Status': '',
      })
      rows.push({} as Record<string, unknown>)
    }
    rows.push({
      'Company': 'GRAND TOTAL',
      'Invoice #': `${data.totals.invoice_count} invoices`,
      'Period': '',
      'Gross Billed': data.totals.gross_billed,
      'TDS Deducted': data.totals.tds_amount,
      'Net Received': data.totals.net_received,
      'TDS Rate %': '',
      'Status': '',
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'TDS Report')
    XLSX.writeFile(wb, `tds-${data.fyLabel.replace(/ /g,'-')}.xlsx`)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  const totals = data?.totals
  const fyOptions = data?.fyOptions ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">TDS Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tax Deducted at Source — {data?.fyLabel ?? ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={fy}
            onChange={e => setFY(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {fyOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={exportXlsx}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Gross Billed</span>
            <span className="text-xl font-black text-gray-900">{fmt(totals.gross_billed)}</span>
            <span className="text-xs text-gray-400">{totals.invoice_count} invoice{totals.invoice_count !== 1 ? 's' : ''}</span>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">TDS Deducted</span>
            <span className="text-xl font-black text-red-700">{fmt(totals.tds_amount)}</span>
            <span className="text-xs text-red-400">Claimable on ITR / Form 26AS</span>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Net Received</span>
            <span className="text-xl font-black text-emerald-700">{fmt(totals.net_received)}</span>
            <span className="text-xs text-emerald-400">After TDS deduction</span>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Companies Deducting</span>
            <span className="text-xl font-black text-blue-700">{data?.byCompany.length ?? 0}</span>
            <span className="text-xs text-blue-400">Issuing TDS certificates</span>
          </div>
        </div>
      )}

      {/* No data */}
      {data && data.byCompany.length === 0 && (
        <div className="flex items-center gap-3 p-6 rounded-xl bg-gray-50 border border-gray-200 text-gray-500">
          <Receipt className="w-5 h-5 shrink-0" />
          <span>No invoices with TDS deduction found for {data.fyLabel}.</span>
        </div>
      )}

      {/* Per-company accordion */}
      {data && data.byCompany.length > 0 && (
        <div className="space-y-3">
          {data.byCompany.map(c => {
            const open = expanded.has(c.company_id)
            return (
              <div key={c.company_id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {/* Company header row */}
                <button
                  type="button"
                  onClick={() => toggle(c.company_id)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {open
                      ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                    <span className="font-bold text-gray-900 truncate">{c.company_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{c.invoice_count} invoice{c.invoice_count !== 1 ? 's' : ''}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full shrink-0">
                      {c.effective_rate}% effective TDS
                    </span>
                  </div>
                  <div className="flex items-center gap-8 shrink-0 text-right">
                    <div className="hidden sm:block">
                      <p className="text-xs text-gray-400">Gross</p>
                      <p className="text-sm font-semibold text-gray-700">{fmt(c.gross_billed)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-red-500">TDS Deducted</p>
                      <p className="text-sm font-bold text-red-700">{fmt(c.tds_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-500">Net Received</p>
                      <p className="text-sm font-bold text-emerald-700">{fmt(c.net_received)}</p>
                    </div>
                  </div>
                </button>

                {/* Invoice detail table */}
                {open && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Invoice #', 'Period', 'Gross Billed', 'TDS Deducted', 'Net Received', 'Rate', 'Status', ''].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {c.invoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-gray-50 group">
                            <td className="px-4 py-3 font-mono text-gray-700">{inv.invoice_number ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtPeriod(inv.period_from, inv.period_to)}</td>
                            <td className="px-4 py-3 text-right text-gray-700 font-medium">{fmt(inv.gross_billed)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-red-700">{fmt(inv.tds_amount)}</td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(inv.net_received)}</td>
                            <td className="px-4 py-3 text-right text-gray-500">{inv.effective_rate}%</td>
                            <td className="px-4 py-3">
                              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600')}>
                                {inv.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Link href={`/billing/invoices/${inv.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                View <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-gray-500 uppercase">Subtotal</td>
                          <td className="px-4 py-2.5 text-right font-bold text-gray-700">{fmt(c.gross_billed)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-red-700">{fmt(c.tds_amount)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{fmt(c.net_received)}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {/* Grand total */}
          {totals && (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-black text-blue-900">Grand Total — {data.fyLabel}</p>
                <p className="text-xs text-blue-500 mt-0.5">File this TDS credit on your income tax return</p>
              </div>
              <div className="flex items-center gap-8 text-right shrink-0">
                <div>
                  <p className="text-xs text-blue-500">Gross Billed</p>
                  <p className="text-base font-bold text-blue-900">{fmt(totals.gross_billed)}</p>
                </div>
                <div>
                  <p className="text-xs text-red-500">TDS Deducted</p>
                  <p className="text-base font-black text-red-700">{fmt(totals.tds_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-500">Net Received</p>
                  <p className="text-base font-bold text-emerald-700">{fmt(totals.net_received)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
