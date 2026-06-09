'use client'
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { ArrowLeft, Printer, Check, IndianRupee, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SendDocumentDialog } from '@/components/billing/SendDocumentDialog'

interface LineItem {
  id: string; booking_id: string; trip_sheet_id: string | null
  booking_ref: string; tripsheet_number: string | null; trip_date: string
  vehicle_type: string; vehicle_number: string | null
  guest_name: string | null; pickup_location: string | null; drop_location: string | null
  trip_type: string | null; actual_kms: number; actual_hrs: number
  package_type: string; package_kms: number; package_rate: number
  extra_kms: number; extra_km_rate: number; extra_km_amount: number
  extra_hrs: number; extra_hr_rate: number; extra_hr_amount: number
  hire_charges: number; toll_amount: number; parking_amount: number; permit_amount: number
  bata_amount: number; line_total: number
}

interface CashBillDetail {
  id: string; bill_number: string | null; client_id: string | null; client_name: string
  period_from: string; period_to: string; subtotal: number; total: number
  payment_mode: string; status: string; notes: string | null; created_at: string
  client?: { name: string; prefix: string | null; designation: string | null; primary_phone: string | null; primary_email: string | null } | null
  line_items: LineItem[]
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', issued: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700', cancelled: 'bg-gray-100 text-gray-400',
}
const PAYMENT_LABELS: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer', cheque: 'Cheque' }

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0.00'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CashBillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const [acting, setActing] = useState(false)
  const [showSend, setShowSend] = useState(false)

  const { data: bill, isLoading } = useQuery<CashBillDetail>({
    queryKey: ['cash-bill', id],
    queryFn: () => fetch(`/api/billing/cash-bills/${id}`).then(r => r.json()),
    enabled: !!id,
  })

  async function updateStatus(status: string) {
    if (!bill) return
    setActing(true)
    const res = await fetch(`/api/billing/cash-bills/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      toast.success(status === 'issued' ? 'Bill issued' : status === 'paid' ? 'Marked as paid' : 'Bill cancelled')
      qc.invalidateQueries({ queryKey: ['cash-bill', id] })
      qc.invalidateQueries({ queryKey: ['cash-bills'] })
    } else toast.error('Failed to update')
    setActing(false)
  }

  if (isLoading || !bill) return <div className="p-8 text-center text-gray-400">{isLoading ? 'Loading…' : 'Not found'}</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/billing/cash-bills')} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{bill.bill_number ?? <span className="text-gray-400 italic text-sm">DRAFT</span>}</h1>
            <p className="text-sm text-gray-500">{bill.client_name} · {fmtDate(bill.period_from)} to {fmtDate(bill.period_to)}</p>
          </div>
          <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[bill.status] ?? 'bg-gray-100 text-gray-600')}>
            {bill.status}
          </span>
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">NO GST</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/billing/cash-bills/${id}/pdf`, '_blank')} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" />Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSend(true)} className="gap-1.5">
            <Send className="w-3.5 h-3.5" />Send
          </Button>
          {bill.status === 'draft' && (
            <Button size="sm" onClick={() => updateStatus('issued')} disabled={acting} className="gap-1.5 bg-blue-700 hover:bg-blue-800">
              <Check className="w-3.5 h-3.5" />Issue Bill
            </Button>
          )}
          {bill.status === 'issued' && (
            <Button size="sm" onClick={() => updateStatus('paid')} disabled={acting} className="gap-1.5 bg-green-700 hover:bg-green-800">
              <IndianRupee className="w-3.5 h-3.5" />Mark Paid
            </Button>
          )}
          {(bill.status === 'draft' || bill.status === 'issued') && (
            <Button variant="outline" size="sm" onClick={() => updateStatus('cancelled')} disabled={acting} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Client', value: bill.client_name },
          { label: 'Payment Mode', value: PAYMENT_LABELS[bill.payment_mode] ?? bill.payment_mode },
          { label: 'Hire Charges', value: fmt(bill.subtotal) },
          { label: 'Total', value: fmt(bill.total) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1 truncate">{value}</p>
          </div>
        ))}
      </div>

      {/* Line items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <span className="font-semibold text-sm">{bill.line_items.length} trips</span>
          <span className="text-xs text-green-700 font-semibold">No GST — Cash Receipt</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['TS#', 'Date', 'Booking Ref', 'Guest', 'Cab No', 'Cab Type', 'KMs', 'Hrs', 'Slab', 'Slab Rate', 'Ext Hrs', 'Ext Hr Amt', 'Ext KMs', 'Ext KM Amt', 'Bata', 'Parking/Toll', 'Total'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {bill.line_items.map((li, i) => (
                <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{li.tripsheet_number ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(li.trip_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{li.booking_ref}</td>
                  <td className="px-3 py-2 max-w-[100px] truncate">{li.guest_name ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{li.vehicle_number ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{li.vehicle_type}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(li.actual_kms).toFixed(0)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{li.trip_type === 'outstation' ? `${Number(li.actual_hrs).toFixed(0)}D` : Number(li.actual_hrs).toFixed(0)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{li.package_type}{li.package_kms > 0 ? `/${li.package_kms}` : ''}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(li.package_rate).toFixed(0)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(li.extra_hrs) > 0 ? Number(li.extra_hrs).toFixed(0) : '0'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{li.extra_hr_amount > 0 ? fmt(li.extra_hr_amount) : '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{Number(li.extra_kms) > 0 ? Number(li.extra_kms).toFixed(0) : '0'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{li.extra_km_amount > 0 ? fmt(li.extra_km_amount) : '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{li.bata_amount > 0 ? fmt(li.bata_amount) : '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{(li.toll_amount + li.parking_amount) > 0 ? fmt(li.toll_amount + li.parking_amount) : '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{fmt(li.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200">
              <tr className="bg-gray-50">
                <td colSpan={16} className="px-3 py-2 font-bold text-sm text-right">TOTAL</td>
                <td className="px-3 py-2 font-bold text-sm text-right whitespace-nowrap">{fmt(bill.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {bill.notes && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-600">
          <strong>Notes:</strong> {bill.notes}
        </div>
      )}

      {showSend && (() => {
        const clientName = bill.client?.name ?? bill.client_name ?? 'Sir/Madam'
        const periodStr = `${fmtDate(bill.period_from)} to ${fmtDate(bill.period_to)}`
        const amtStr = `₹${Number(bill.total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        const docNum = bill.bill_number ?? 'DRAFT'
        const subject = `Cash Bill ${docNum} — JMS Travels`
        const emailBody = [
          `Dear ${clientName},`,
          '',
          `Please find attached Cash Bill ${docNum} for the period ${periodStr}.`,
          '',
          `Bill Details:`,
          `  Bill No  : ${docNum}`,
          `  Client   : ${clientName}`,
          `  Amount   : ${amtStr}`,
          '',
          `Kindly acknowledge receipt.`,
          '',
          `For any queries, please reach us at:`,
          `  Phone : 9845572207`,
          `  Email : bookings@jmstravels.net`,
          '',
          `Thank you for your business.`,
          '',
          `Warm regards,`,
          `JMS Travels`,
        ].join('\n')
        const waMessage = [
          `Dear ${clientName},`,
          '',
          `Please find attached Cash Bill *${docNum}* for the period ${periodStr}.`,
          '',
          `💰 *Amount:* ${amtStr}`,
          '',
          `Kindly acknowledge receipt. For queries, call us at 📞 9845572207.`,
          '',
          `Thank you,`,
          `*JMS Travels*`,
        ].join('\n')
        return (
          <SendDocumentDialog
            open
            onClose={() => setShowSend(false)}
            pdfUrl={`/api/billing/cash-bills/${id}/pdf`}
            docNumber={docNum}
            docType="cash_bill"
            vars={{ docNumber: docNum, clientName, period: periodStr, amount: amtStr, dueDate: '' }}
            defaultEmail={bill.client?.primary_email ?? ''}
            defaultPhone={bill.client?.primary_phone ?? ''}
            defaultSubject={subject}
            defaultEmailBody={emailBody}
            defaultWaMessage={waMessage}
          />
        )
      })()}
    </div>
  )
}
