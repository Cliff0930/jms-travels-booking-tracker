'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Download, ChevronDown, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'

interface InvoiceRow {
  invoice_number: string | null
  period_from: string
  period_to: string
  due_date: string | null
  grand_total: number
  amount_paid: number
  balance_due: number
  status: string
  age_days: number
}

interface CompanyRow {
  company_id: string
  company_name: string
  gstin: string | null
  total_billed: number
  total_paid: number
  outstanding: number
  current: number
  days1_30: number
  days31_60: number
  days61_90: number
  days90plus: number
  invoices: InvoiceRow[]
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function ageBucket(days: number) {
  if (days <= 0)  return { label: 'Current',   cls: 'text-green-700 bg-green-50' }
  if (days <= 30) return { label: '1–30 days', cls: 'text-amber-700 bg-amber-50' }
  if (days <= 60) return { label: '31–60 days', cls: 'text-orange-700 bg-orange-50' }
  if (days <= 90) return { label: '61–90 days', cls: 'text-red-600 bg-red-50' }
  return { label: '90+ days', cls: 'text-red-800 bg-red-100 font-semibold' }
}

export default function ARAgingPage() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const { data: rows = [], isLoading } = useQuery<CompanyRow[]>({
    queryKey: ['ar-ageing'],
    queryFn: () => fetch('/api/billing/ar-ageing').then(r => r.json()),
    refetchInterval: 60000,
  })

  const totals = rows.reduce((acc, r) => ({
    outstanding: acc.outstanding + r.outstanding,
    current:     acc.current    + r.current,
    d1_30:       acc.d1_30     + r.days1_30,
    d31_60:      acc.d31_60    + r.days31_60,
    d61_90:      acc.d61_90    + r.days61_90,
    d90plus:     acc.d90plus   + r.days90plus,
  }), { outstanding: 0, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 })

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    const summaryData = rows.map(r => ({
      'Company':     r.company_name,
      'GSTIN':       r.gstin ?? '',
      'Total Billed': r.total_billed,
      'Total Paid':  r.total_paid,
      'Outstanding': r.outstanding,
      'Current':     r.current,
      '1–30 Days':   r.days1_30,
      '31–60 Days':  r.days31_60,
      '61–90 Days':  r.days61_90,
      '90+ Days':    r.days90plus,
    }))
    summaryData.push({
      'Company': 'TOTAL', 'GSTIN': '',
      'Total Billed': rows.reduce((s, r) => s + r.total_billed, 0),
      'Total Paid': rows.reduce((s, r) => s + r.total_paid, 0),
      'Outstanding': totals.outstanding,
      'Current': totals.current,
      '1–30 Days': totals.d1_30,
      '31–60 Days': totals.d31_60,
      '61–90 Days': totals.d61_90,
      '90+ Days': totals.d90plus,
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'AR Ageing Summary')

    const detailData = rows.flatMap(r =>
      r.invoices.map(inv => ({
        'Company':       r.company_name,
        'GSTIN':         r.gstin ?? '',
        'Invoice #':     inv.invoice_number ?? 'Draft',
        'Period From':   inv.period_from,
        'Period To':     inv.period_to,
        'Due Date':      inv.due_date ?? '',
        'Invoice Value': inv.grand_total,
        'Amount Paid':   inv.amount_paid,
        'Balance Due':   inv.balance_due,
        'Status':        inv.status,
        'Days Overdue':  inv.age_days > 0 ? inv.age_days : 0,
        'Ageing Bucket': ageBucket(inv.age_days).label,
      }))
    )
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailData), 'Invoice Detail')
    XLSX.writeFile(wb, `ar-ageing-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        title="AR Ageing"
        description="Outstanding invoices by company — ageing from due date"
        actions={
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
            <Download className="w-4 h-4" /> Export Excel
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total Outstanding', value: totals.outstanding, cls: 'text-[#191B23]' },
          { label: 'Current',           value: totals.current,     cls: 'text-green-700' },
          { label: '1–30 Days',         value: totals.d1_30,       cls: 'text-amber-700' },
          { label: '31–60 Days',        value: totals.d31_60,      cls: 'text-orange-700' },
          { label: '61–90 Days',        value: totals.d61_90,      cls: 'text-red-600' },
          { label: '90+ Days',          value: totals.d90plus,     cls: 'text-red-800' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg border border-[#E5E7EB] p-3">
            <p className="text-xs text-[#737686] mb-1">{c.label}</p>
            <p className={`text-base font-semibold ${c.cls}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E5E7EB] overflow-hidden">
        {isLoading ? (
          <p className="p-8 text-center text-[#737686]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-[#737686]">No outstanding invoices. All invoices are paid.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[#737686] uppercase tracking-wider">Company</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#737686] uppercase tracking-wider hidden sm:table-cell">Billed</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#737686] uppercase tracking-wider hidden sm:table-cell">Paid</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#737686] uppercase tracking-wider">Outstanding</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-green-700 uppercase tracking-wider hidden lg:table-cell">Current</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-amber-700 uppercase tracking-wider hidden lg:table-cell">1–30d</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-orange-700 uppercase tracking-wider hidden lg:table-cell">31–60d</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-red-600 uppercase tracking-wider hidden lg:table-cell">61–90d</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-red-800 uppercase tracking-wider hidden lg:table-cell">90+d</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {rows.map(row => (
                <>
                  <tr
                    key={row.company_id}
                    className="hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                    onClick={() => toggleExpand(row.company_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {expanded.has(row.company_id)
                          ? <ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-[#9CA3AF] shrink-0" />}
                        <div>
                          <p className="font-medium text-[#191B23]">{row.company_name}</p>
                          {row.gstin && <p className="text-xs text-[#9CA3AF]">{row.gstin}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-[#434654] hidden sm:table-cell">{fmt(row.total_billed)}</td>
                    <td className="px-4 py-3 text-right text-[#434654] hidden sm:table-cell">{fmt(row.total_paid)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#191B23]">{fmt(row.outstanding)}</td>
                    <td className="px-4 py-3 text-right text-green-700 hidden lg:table-cell">{row.current > 0 ? fmt(row.current) : '—'}</td>
                    <td className="px-4 py-3 text-right text-amber-700 hidden lg:table-cell">{row.days1_30 > 0 ? fmt(row.days1_30) : '—'}</td>
                    <td className="px-4 py-3 text-right text-orange-700 hidden lg:table-cell">{row.days31_60 > 0 ? fmt(row.days31_60) : '—'}</td>
                    <td className="px-4 py-3 text-right text-red-600 hidden lg:table-cell">{row.days61_90 > 0 ? fmt(row.days61_90) : '—'}</td>
                    <td className="px-4 py-3 text-right text-red-800 font-medium hidden lg:table-cell">{row.days90plus > 0 ? fmt(row.days90plus) : '—'}</td>
                  </tr>
                  {expanded.has(row.company_id) && row.invoices.map((inv, idx) => {
                    const bucket = ageBucket(inv.age_days)
                    return (
                      <tr key={idx} className="bg-[#F9FAFB]">
                        <td className="pl-12 pr-4 py-2">
                          <div>
                            <span className="text-xs font-medium text-[#191B23]">{inv.invoice_number ?? 'Draft'}</span>
                            <span className="text-xs text-[#9CA3AF] ml-2">{inv.period_from} → {inv.period_to}</span>
                            {inv.due_date && <span className="text-xs text-[#9CA3AF] ml-2">Due: {inv.due_date}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-[#434654] hidden sm:table-cell">{fmt(inv.grand_total)}</td>
                        <td className="px-4 py-2 text-right text-xs text-[#434654] hidden sm:table-cell">{fmt(inv.amount_paid)}</td>
                        <td className="px-4 py-2 text-right text-xs font-medium text-[#191B23]">{fmt(inv.balance_due)}</td>
                        <td colSpan={5} className="px-4 py-2 hidden lg:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded ${bucket.cls}`}>{bucket.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
              <tr className="bg-[#F3F4F6] font-semibold border-t-2 border-[#E5E7EB]">
                <td className="px-4 py-3 text-[#191B23]">Total</td>
                <td className="px-4 py-3 text-right text-[#191B23] hidden sm:table-cell">{fmt(rows.reduce((s,r)=>s+r.total_billed,0))}</td>
                <td className="px-4 py-3 text-right text-[#191B23] hidden sm:table-cell">{fmt(rows.reduce((s,r)=>s+r.total_paid,0))}</td>
                <td className="px-4 py-3 text-right text-[#191B23]">{fmt(totals.outstanding)}</td>
                <td className="px-4 py-3 text-right text-green-700 hidden lg:table-cell">{fmt(totals.current)}</td>
                <td className="px-4 py-3 text-right text-amber-700 hidden lg:table-cell">{fmt(totals.d1_30)}</td>
                <td className="px-4 py-3 text-right text-orange-700 hidden lg:table-cell">{fmt(totals.d31_60)}</td>
                <td className="px-4 py-3 text-right text-red-600 hidden lg:table-cell">{fmt(totals.d61_90)}</td>
                <td className="px-4 py-3 text-right text-red-800 hidden lg:table-cell">{fmt(totals.d90plus)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
