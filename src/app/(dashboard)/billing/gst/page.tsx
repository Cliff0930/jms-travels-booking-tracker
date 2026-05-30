'use client'
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Invoice {
  id: string; invoice_number: string; period_from: string; period_to: string
  subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number
  grand_total: number; status: string; created_at: string
  company?: { name: string }
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function GSTWorkingPage() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices-gst', month],
    queryFn: () => fetch('/api/billing/invoices').then(r => r.json()),
  })

  const filtered = useMemo(() => {
    return invoices.filter(i => i.status !== 'cancelled' && (i.period_from.startsWith(month) || i.period_to.startsWith(month)))
  }, [invoices, month])

  const totals = useMemo(() => filtered.reduce((acc, i) => ({
    taxable: acc.taxable + Number(i.subtotal),
    cgst: acc.cgst + Number(i.cgst_amount),
    sgst: acc.sgst + Number(i.sgst_amount),
    igst: acc.igst + Number(i.igst_amount),
    total: acc.total + Number(i.grand_total),
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }), [filtered])

  function exportExcel() {
    const rows = filtered.map(i => ({
      'Invoice #': i.invoice_number,
      'Company': i.company?.name ?? '',
      'Period From': i.period_from,
      'Period To': i.period_to,
      'SAC Code': '996601',
      'Taxable Amount (₹)': Number(i.subtotal),
      'CGST 2.5% (₹)': Number(i.cgst_amount),
      'SGST 2.5% (₹)': Number(i.sgst_amount),
      'IGST 5% (₹)': Number(i.igst_amount),
      'Total GST (₹)': Number(i.cgst_amount) + Number(i.sgst_amount) + Number(i.igst_amount),
      'Invoice Total (₹)': Number(i.grand_total),
      'Status': i.status,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `GST-${month}`)
    XLSX.writeFile(wb, `gst-working-${month}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST Working"
        description="SAC 996601 — Motor vehicle transport services | CGST 2.5% + SGST 2.5% | IGST 5%"
        actions={<Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5"><Download className="w-3.5 h-3.5" />Export Excel</Button>}
      />

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Select Month:</label>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          className="border border-gray-200 rounded-md h-9 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Taxable (Hire)', value: fmt(totals.taxable) },
          { label: 'CGST (2.5%)', value: fmt(totals.cgst) },
          { label: 'SGST (2.5%)', value: fmt(totals.sgst) },
          { label: 'IGST (5%)', value: fmt(totals.igst) },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className="text-lg font-bold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No invoices for {month}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Invoice #', 'Company', 'Period', 'SAC', 'Taxable (₹)', 'CGST 2.5%', 'SGST 2.5%', 'IGST 5%', 'Total GST'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(i => (
                <tr key={i.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-blue-700">{i.invoice_number}</td>
                  <td className="px-4 py-2.5 text-gray-900">{i.company?.name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{i.period_from} — {i.period_to}</td>
                  <td className="px-4 py-2.5 text-gray-400">996601</td>
                  <td className="px-4 py-2.5 font-medium">{fmt(Number(i.subtotal))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(i.cgst_amount))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(i.sgst_amount))}</td>
                  <td className="px-4 py-2.5">{fmt(Number(i.igst_amount))}</td>
                  <td className="px-4 py-2.5 font-semibold">{fmt(Number(i.cgst_amount) + Number(i.sgst_amount) + Number(i.igst_amount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-blue-50 border-t-2 border-blue-200">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 font-bold text-gray-700">TOTAL</td>
                <td className="px-4 py-2.5 font-bold">{fmt(totals.taxable)}</td>
                <td className="px-4 py-2.5 font-bold">{fmt(totals.cgst)}</td>
                <td className="px-4 py-2.5 font-bold">{fmt(totals.sgst)}</td>
                <td className="px-4 py-2.5 font-bold">{fmt(totals.igst)}</td>
                <td className="px-4 py-2.5 font-bold text-blue-700">{fmt(totals.cgst + totals.sgst + totals.igst)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
