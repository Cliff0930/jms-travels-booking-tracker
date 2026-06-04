'use client'
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, Printer, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreditNoteLine {
  id: string; booking_ref: string | null; description: string
  amount: number; cgst_rate: number; sgst_rate: number; igst_rate: number
  cgst_amount: number; sgst_amount: number; igst_amount: number; line_total: number
}

interface CreditNoteDetail {
  id: string; cn_number: string | null; status: string; reason: string; notes: string | null
  subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number; total_amount: number
  created_at: string; issued_at: string | null
  company?: { name: string; gstin?: string | null; address?: string | null } | null
  invoice?: { invoice_number: string | null; period_from: string; period_to: string } | null
  line_items: CreditNoteLine[]
}

const STATUS_COLORS: Record<string, string> = {
  draft:  'bg-gray-100 text-gray-600',
  issued: 'bg-red-50 text-red-700',
  voided: 'bg-gray-100 text-gray-400',
}

function fmt(n: number) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CreditNoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const [acting, setActing] = useState<'issue' | 'void' | null>(null)
  const [showVoidConfirm, setShowVoidConfirm] = useState(false)

  const { data: cn, isLoading } = useQuery<CreditNoteDetail>({
    queryKey: ['credit-note', id],
    queryFn: () => fetch(`/api/billing/credit-notes/${id}`).then(r => r.json()),
    enabled: !!id,
  })

  async function handleAction(action: 'issue' | 'void') {
    setActing(action)
    try {
      const res = await fetch(`/api/billing/credit-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(action === 'issue' ? `Credit note ${json.cn_number} issued` : 'Credit note voided')
      qc.invalidateQueries({ queryKey: ['credit-note', id] })
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
      setShowVoidConfirm(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setActing(null)
    }
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!cn) return <div className="p-8 text-center text-gray-400">Credit note not found</div>

  const useIgst = cn.igst_amount > 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/billing/credit-notes')} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {cn.cn_number ?? <span className="text-gray-400 italic font-normal">DRAFT</span>}
            </h1>
            <p className="text-sm text-gray-500">
              {cn.company?.name ?? 'Walk-in'}{cn.invoice?.invoice_number ? ` · Against ${cn.invoice.invoice_number}` : ''}
            </p>
          </div>
          <span className={cn_c('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[cn.status] ?? '')}>
            {cn.status}
          </span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/billing/credit-notes/${id}/pdf`, '_blank')} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Download PDF
          </Button>
          {cn.status === 'draft' && (
            <Button
              size="sm"
              onClick={() => handleAction('issue')}
              disabled={acting !== null}
              className="gap-1.5 bg-red-700 hover:bg-red-800 text-white"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {acting === 'issue' ? 'Issuing…' : 'Issue Credit Note'}
            </Button>
          )}
          {cn.status === 'issued' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowVoidConfirm(true)}
              className="gap-1.5 text-gray-600 border-gray-300"
            >
              <XCircle className="w-3.5 h-3.5" /> Void
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Net Amount',   value: fmt(cn.subtotal) },
          { label: useIgst ? 'IGST (5%)' : 'GST (5%)', value: fmt(useIgst ? cn.igst_amount : cn.cgst_amount + cn.sgst_amount) },
          { label: 'Total Credit', value: fmt(cn.total_amount), red: true },
          { label: 'Status',       value: cn.status.charAt(0).toUpperCase() + cn.status.slice(1) },
        ].map(c => (
          <div key={c.label} className={cn_c('rounded-xl border p-4', c.red ? 'bg-red-700 border-red-700' : 'bg-white border-gray-200')}>
            <div className={cn_c('text-xs font-medium mb-1', c.red ? 'text-red-200' : 'text-gray-500')}>{c.label}</div>
            <div className={cn_c('text-xl font-bold', c.red ? 'text-white' : 'text-gray-900')}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Credit Note Details</h2>
          <dl className="space-y-2 text-sm">
            {[
              { label: 'CN Number',       value: cn.cn_number ?? 'Not yet issued' },
              { label: 'Date',            value: fmtDate(cn.issued_at ?? cn.created_at) },
              { label: 'Against Invoice', value: cn.invoice?.invoice_number ?? '—' },
              { label: 'Company',         value: cn.company?.name ?? '—' },
              { label: 'GSTIN',           value: cn.company?.gstin ?? '—' },
            ].map(r => (
              <div key={r.label} className="flex justify-between gap-2">
                <dt className="text-gray-500">{r.label}</dt>
                <dd className="font-medium text-gray-900 text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-xl border border-red-100 p-5 space-y-3 bg-red-50/30">
          <h2 className="text-sm font-semibold text-red-700">Reason for Credit</h2>
          <p className="text-sm text-gray-700 font-medium">{cn.reason}</p>
          {cn.notes && <p className="text-xs text-gray-500 mt-2">{cn.notes}</p>}
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Credit Line Items ({cn.line_items.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Description</th>
              {cn.line_items.some(li => li.booking_ref) && (
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Booking Ref</th>
              )}
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Net Amount</th>
              {useIgst
                ? <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">IGST</th>
                : <>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">CGST</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">SGST</th>
                  </>
              }
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500">Credit Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cn.line_items.map(li => (
              <tr key={li.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{li.description}</td>
                {cn.line_items.some(l => l.booking_ref) && (
                  <td className="px-4 py-3 font-medium text-blue-700">{li.booking_ref ?? '—'}</td>
                )}
                <td className="px-4 py-3 text-right">{fmt(li.amount)}</td>
                {useIgst
                  ? <td className="px-4 py-3 text-right text-gray-500">{fmt(li.igst_amount)}</td>
                  : <>
                      <td className="px-4 py-3 text-right text-gray-500">{fmt(li.cgst_amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{fmt(li.sgst_amount)}</td>
                    </>
                }
                <td className="px-4 py-3 text-right font-bold text-red-700">{fmt(li.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td colSpan={cn.line_items.some(li => li.booking_ref) ? 2 : 1} className="px-4 py-2.5 font-semibold text-gray-700">Total</td>
              <td className="px-4 py-2.5 text-right font-bold">{fmt(cn.subtotal)}</td>
              {useIgst
                ? <td className="px-4 py-2.5 text-right font-bold text-gray-600">{fmt(cn.igst_amount)}</td>
                : <>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-600">{fmt(cn.cgst_amount)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-600">{fmt(cn.sgst_amount)}</td>
                  </>
              }
              <td className="px-4 py-2.5 text-right font-bold text-red-700 text-base">{fmt(cn.total_amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Void confirmation dialog */}
      {showVoidConfirm && (
        <Dialog open onOpenChange={o => { if (!o) setShowVoidConfirm(false) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Void Credit Note?</DialogTitle></DialogHeader>
            <div className="py-2">
              <p className="text-sm text-gray-700">
                Voiding <strong>{cn.cn_number}</strong> cancels it permanently.
                The credit note stays on record but is no longer valid.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowVoidConfirm(false)}>Cancel</Button>
              <Button
                onClick={() => handleAction('void')}
                disabled={acting !== null}
                className="bg-gray-700 hover:bg-gray-800 text-white"
              >
                {acting === 'void' ? 'Voiding…' : 'Yes, Void It'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// alias to avoid name collision with data variable
const cn_c = cn
