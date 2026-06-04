'use client'
import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { ExternalLink, Download, AlertTriangle, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import * as XLSX from 'xlsx'

interface InvoiceRow {
  id: string; invoice_number: string | null; company_id: string; company_name: string
  period_from: string; period_to: string; grand_total: number; amount_paid: number
  balance_due: number; tds_amount: number; status: string; due_date: string | null
  days_overdue: number; bucket: '0-30' | '31-60' | '61-90' | '90+'
}
interface ByBucket { '0-30': number; '31-60': number; '61-90': number; '90+': number }
interface CompanyRoll { name: string; total: number; count: number }
interface OutstandingData {
  total: number; byBucket: ByBucket; byCompany: CompanyRoll[]; invoices: InvoiceRow[]
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtPeriod(from: string, to: string) {
  const f = new Date(from + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const t = new Date(to   + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${f} – ${t}`
}

const BUCKET_META: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  '0-30':  { label: '0–30 days',  color: 'text-amber-700',  bg: 'bg-amber-50',  ring: 'ring-amber-200' },
  '31-60': { label: '31–60 days', color: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-200' },
  '61-90': { label: '61–90 days', color: 'text-red-700',    bg: 'bg-red-50',    ring: 'ring-red-200' },
  '90+':   { label: '90+ days',   color: 'text-red-900',    bg: 'bg-red-100',   ring: 'ring-red-300' },
}

const STATUS_COLORS: Record<string, string> = {
  sent:            'bg-blue-50 text-blue-700',
  partially_paid:  'bg-yellow-50 text-yellow-700',
  overdue:         'bg-red-50 text-red-700',
}
const STATUS_LABELS: Record<string, string> = {
  sent: 'Sent', partially_paid: 'Part paid', overdue: 'Overdue',
}

export default function OutstandingDuesPage() {
  const { data, isLoading } = useQuery<OutstandingData>({
    queryKey: ['outstanding-dues'],
    queryFn: () => fetch('/api/analytics/outstanding').then(r => r.json()),
  })

  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [bucketFilter, setBucketFilter] = useState<string>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const invoices = data?.invoices ?? []
  const companies = useMemo(() => {
    const seen = new Map<string, string>()
    for (const inv of invoices) seen.set(inv.company_id, inv.company_name)
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [invoices])

  const filtered = useMemo(() => {
    let rows = [...invoices]
    if (companyFilter !== 'all') rows = rows.filter(r => r.company_id === companyFilter)
    if (bucketFilter  !== 'all') rows = rows.filter(r => r.bucket === bucketFilter)
    rows.sort((a, b) => sortDir === 'desc' ? b.days_overdue - a.days_overdue : a.days_overdue - b.days_overdue)
    return rows
  }, [invoices, companyFilter, bucketFilter, sortDir])

  const filteredTotal = filtered.reduce((s, r) => s + r.balance_due, 0)

  function exportXlsx() {
    const rows = filtered.map(r => ({
      'Company':        r.company_name,
      'Invoice #':      r.invoice_number ?? '',
      'Period':         fmtPeriod(r.period_from, r.period_to),
      'Invoice Total':  r.grand_total,
      'Paid':           r.amount_paid,
      'Balance Due':    r.balance_due,
      'TDS':            r.tds_amount,
      'Status':         STATUS_LABELS[r.status] ?? r.status,
      'Due Date':       r.due_date ?? '',
      'Days Overdue':   r.days_overdue,
      'Age Bucket':     r.bucket,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Outstanding Dues')
    XLSX.writeFile(wb, `outstanding-dues-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Outstanding Dues</h1>
          <p className="text-sm text-gray-500 mt-0.5">All unpaid invoices — aged by days since due date</p>
        </div>
        <button
          onClick={exportXlsx}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Bucket summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2 lg:col-span-1 rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Outstanding</span>
          <span className="text-2xl font-black text-gray-900">{fmt(data?.total ?? 0)}</span>
          <span className="text-xs text-gray-400">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</span>
        </div>
        {(['0-30', '31-60', '61-90', '90+'] as const).map(b => {
          const m = BUCKET_META[b]
          const amt = data?.byBucket[b] ?? 0
          const count = invoices.filter(i => i.bucket === b).length
          return (
            <button
              key={b}
              onClick={() => setBucketFilter(bucketFilter === b ? 'all' : b)}
              className={cn(
                'rounded-xl border p-4 text-left flex flex-col gap-1 transition-all ring-2',
                bucketFilter === b ? `${m.bg} ${m.ring} border-transparent` : 'bg-white border-gray-200 ring-transparent hover:border-gray-300'
              )}
            >
              <span className={cn('text-xs font-semibold uppercase tracking-wide', bucketFilter === b ? m.color : 'text-gray-500')}>{m.label}</span>
              <span className={cn('text-xl font-black', bucketFilter === b ? m.color : 'text-gray-900')}>{fmt(amt)}</span>
              <span className={cn('text-xs', bucketFilter === b ? m.color : 'text-gray-400')}>{count} invoice{count !== 1 ? 's' : ''}</span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={companyFilter}
          onChange={e => setCompanyFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All companies</option>
          {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>

        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white text-gray-700 hover:bg-gray-50"
        >
          <Clock className="w-3.5 h-3.5" />
          Age: {sortDir === 'desc' ? 'Oldest first' : 'Newest first'}
        </button>

        {(companyFilter !== 'all' || bucketFilter !== 'all') && (
          <button
            onClick={() => { setCompanyFilter('all'); setBucketFilter('all') }}
            className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}

        {filtered.length !== invoices.length && (
          <span className="text-sm text-gray-500 ml-auto">
            {filtered.length} of {invoices.length} — {fmt(filteredTotal)} showing
          </span>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex items-center gap-3 p-6 rounded-xl bg-green-50 border border-green-200 text-green-700">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="font-semibold">No outstanding invoices match the current filters.</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  { label: 'Company',       align: 'left'  },
                  { label: 'Invoice #',     align: 'left'  },
                  { label: 'Period',        align: 'left'  },
                  { label: 'Invoice Total', align: 'right' },
                  { label: 'Paid',          align: 'right' },
                  { label: 'Balance Due',   align: 'right' },
                  { label: 'Due Date',      align: 'left'  },
                  { label: 'Age',           align: 'left'  },
                  { label: 'Status',        align: 'left'  },
                  { label: '',              align: 'left'  },
                ].map(({ label, align }) => (
                  <th key={label} className={`px-4 py-3 font-semibold text-gray-500 whitespace-nowrap text-xs uppercase tracking-wide text-${align}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(inv => {
                const bm = BUCKET_META[inv.bucket]
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap max-w-[140px] truncate">{inv.company_name}</td>
                    <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{inv.invoice_number ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtPeriod(inv.period_from, inv.period_to)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-700 whitespace-nowrap">{fmt(inv.grand_total)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{fmt(inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmt(inv.balance_due)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', bm.bg, bm.color)}>
                        {inv.days_overdue <= 0
                          ? 'Due soon'
                          : `${inv.days_overdue}d`}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600')}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/billing/invoices/${inv.id}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        View <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
                </td>
                <td className="px-4 py-3 text-right font-black text-gray-900 whitespace-nowrap">{fmt(filteredTotal)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Top debtors */}
      {data && data.byCompany.length > 0 && companyFilter === 'all' && bucketFilter === 'all' && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Top debtors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.byCompany.slice(0, 6).map(c => (
              <div key={c.name} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.count} invoice{c.count !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-sm font-bold text-gray-900">{fmt(c.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
