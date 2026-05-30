'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Payment {
  id: string; invoice_id: string; amount: number; payment_mode: string
  payment_date: string; reference_number: string | null; tds_amount: number; notes: string | null; created_at: string
  invoice?: { invoice_number: string; company?: { name: string } }
}

const MODE_LABELS: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank Transfer', upi: 'UPI', cheque: 'Cheque', neft: 'NEFT', rtgs: 'RTGS' }

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PaymentsPage() {
  const router = useRouter()
  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ['billing-payments'],
    queryFn: () => fetch('/api/billing/payments').then(r => r.json()),
  })

  const totalReceived = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalTDS = payments.reduce((s, p) => s + Number(p.tds_amount ?? 0), 0)

  function exportExcel() {
    const rows = payments.map(p => ({
      'Date': fmtDate(p.payment_date),
      'Invoice #': p.invoice?.invoice_number ?? '',
      'Company': p.invoice?.company?.name ?? '',
      'Amount Received (₹)': Number(p.amount),
      'TDS Deducted (₹)': Number(p.tds_amount ?? 0),
      'Mode': MODE_LABELS[p.payment_mode] ?? p.payment_mode,
      'Reference': p.reference_number ?? '',
      'Notes': p.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payments')
    XLSX.writeFile(wb, `billing-payments-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments Received"
        description="All payments recorded against invoices"
        actions={<Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5"><Download className="w-3.5 h-3.5" />Excel</Button>}
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total Received</div>
          <div className="text-2xl font-bold text-green-700">{fmt(totalReceived)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 mb-1">Total TDS Deducted</div>
          <div className="text-2xl font-bold text-orange-600">{fmt(totalTDS)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No payments recorded yet. Open an invoice and click "Record Payment".</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Date', 'Invoice #', 'Company', 'Amount', 'TDS', 'Mode', 'Reference', 'Notes'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/billing/invoices/${p.invoice_id}`)}>
                  <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(p.payment_date)}</td>
                  <td className="px-4 py-2.5 font-medium text-blue-700 whitespace-nowrap">{p.invoice?.invoice_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-900 whitespace-nowrap">{p.invoice?.company?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-green-700 whitespace-nowrap">{fmt(p.amount)}</td>
                  <td className="px-4 py-2.5 text-orange-600 whitespace-nowrap">{p.tds_amount > 0 ? fmt(p.tds_amount) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{MODE_LABELS[p.payment_mode] ?? p.payment_mode}</td>
                  <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{p.reference_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{p.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
