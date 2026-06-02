'use client'
import { use, useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, Printer, Download, IndianRupee, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { TripsheetEditPopup } from '@/components/billing/TripsheetEditPopup'

interface LineItem {
  id: string; booking_id: string; trip_sheet_id: string | null
  booking_ref: string; tripsheet_number: string | null; trip_date: string; vehicle_type: string
  guest_name: string | null; pickup_location: string | null; drop_location: string | null
  package_type: string; actual_kms: number; actual_hrs: number; package_kms: number
  package_rate: number; extra_kms: number; extra_km_rate: number; extra_km_amount: number
  extra_hrs: number; extra_hr_rate: number; extra_hr_amount: number
  hire_charges: number; toll_amount: number; parking_amount: number; permit_amount: number
  bata_amount: number; bill_bata: boolean; gst_taxable: number
  cgst_rate: number; sgst_rate: number; igst_rate: number
  cgst_amount: number; sgst_amount: number; igst_amount: number; line_total: number
  trip_type: string; vehicle_number: string | null
  reviewed: boolean
}

interface Payment {
  id: string; amount: number; payment_mode: string; payment_date: string
  reference_number: string | null; tds_amount: number; notes: string | null
}

interface InvoiceDetail {
  id: string; invoice_number: string; period_from: string; period_to: string
  subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number
  tds_amount: number; grand_total: number; amount_paid: number; balance_due: number
  status: string; due_date: string | null; notes: string | null; created_at: string
  reverse_charge: boolean
  guest_client_id?: string | null
  addressee_prefix?: string | null
  addressee_name?: string | null
  addressee_designation?: string | null
  company?: { name: string; gstin?: string; address?: string | null }
  line_items: LineItem[]
  payments: Payment[]
}

const MODE_LABELS: Record<string, string> = { cash: 'Cash', bank_transfer: 'Bank Transfer', upi: 'UPI', cheque: 'Cheque', neft: 'NEFT', rtgs: 'RTGS' }
const STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-50 text-blue-700', paid: 'bg-green-50 text-green-700', partially_paid: 'bg-yellow-50 text-yellow-700', overdue: 'bg-red-50 text-red-700' }

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0.00'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PaymentModal({ invoiceId, balanceDue, onClose, onSaved }: { invoiceId: string; balanceDue: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ amount: String(balanceDue.toFixed(2)), payment_mode: 'bank_transfer', payment_date: new Date().toISOString().slice(0, 10), reference_number: '', tds_amount: '0', notes: '' })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    const res = await fetch('/api/billing/payments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: invoiceId, amount: Number(form.amount), payment_mode: form.payment_mode, payment_date: form.payment_date, reference_number: form.reference_number || null, tds_amount: Number(form.tds_amount) || 0, notes: form.notes || null }),
    })
    if (res.ok) { toast.success('Payment recorded'); onSaved() }
    else toast.error('Failed to record payment')
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount Received (₹) *</Label>
              <Input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} type="number" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">TDS Deducted (₹)</Label>
              <Input value={form.tds_amount} onChange={e => setForm(f => ({ ...f, tds_amount: e.target.value }))} type="number" placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Mode *</Label>
              <Select value={form.payment_mode} onValueChange={(v: string | null) => setForm(f => ({ ...f, payment_mode: v ?? '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(MODE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Date *</Label>
              <Input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference / Cheque Number</Label>
            <Input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="UTR / cheque no." />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const [showPayment, setShowPayment] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [tripsheetPopup, setTripsheetPopup] = useState<{ lineItemId: string; bookingId: string; tripSheetId: string; bookingRef: string; tripType: string | null } | null>(null)
  const { data: inv, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: () => fetch(`/api/billing/invoices/${id}`).then(r => r.json()),
    enabled: !!id,
  })

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set())
  const invIdRef = useRef<string | null>(null)

  // Sync reviewed state from server when invoice loads or changes
  useEffect(() => {
    if (inv && invIdRef.current !== inv.id) {
      invIdRef.current = inv.id
      setReviewedIds(new Set(inv.line_items.filter(li => li.reviewed).map(li => li.id)))
    }
  }, [inv])

  async function toggleReviewed(liId: string) {
    const isReviewed = !reviewedIds.has(liId)
    setReviewedIds(prev => { const n = new Set(prev); isReviewed ? n.add(liId) : n.delete(liId); return n })
    await fetch(`/api/billing/invoices/${id}/line-items/${liId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewed: isReviewed }),
    }).catch(() => {
      setReviewedIds(prev => { const n = new Set(prev); isReviewed ? n.delete(liId) : n.add(liId); return n })
    })
  }

  async function cancelInvoice() {
    setCancelling(true)
    const res = await fetch(`/api/billing/invoices/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Invoice cancelled')
      qc.invalidateQueries({ queryKey: ['invoice', id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      setShowCancel(false)
    } else {
      toast.error('Failed to cancel invoice')
    }
    setCancelling(false)
  }

  async function markSent() {
    await fetch(`/api/billing/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'sent' }) })
    toast.success('Invoice finalised'); qc.invalidateQueries({ queryKey: ['invoice', id] })
  }

  function exportExcel() {
    if (!inv) return
    const rows = inv.line_items.map(li => ({
      'Date': li.trip_date,
      'Booking Ref': li.booking_ref,
      'Guest Name': li.guest_name ?? '',
      'Vehicle Type': li.vehicle_type,
      'Vehicle No': li.vehicle_number ?? '',
      'Pickup': li.pickup_location ?? '',
      'Drop': li.drop_location ?? '',
      'Trip Type': li.trip_type,
      'Package': li.package_type,
      'Actual KMs': li.actual_kms,
      'Actual Hrs': li.actual_hrs,
      'Package KMs': li.package_kms,
      'Package Rate (₹)': li.package_rate,
      'Extra KMs': li.extra_kms,
      'Extra KM Rate': li.extra_km_rate,
      'Extra KM Amount (₹)': li.extra_km_amount,
      'Extra Hrs': li.extra_hrs,
      'Extra Hr Amount (₹)': li.extra_hr_amount,
      'Hire Charges (₹)': li.hire_charges,
      'Toll (₹)': li.toll_amount,
      'Parking (₹)': li.parking_amount,
      'Permit (₹)': li.permit_amount,
      'Bata (₹)': li.bill_bata ? li.bata_amount : 0,
      'GST Taxable (₹)': li.gst_taxable,
      'CGST (₹)': li.cgst_amount,
      'SGST (₹)': li.sgst_amount,
      'IGST (₹)': li.igst_amount,
      'Line Total (₹)': li.line_total,
    }))

    // Summary row
    rows.push({} as typeof rows[0])
    rows.push({ 'Date': '', 'Booking Ref': 'INVOICE SUMMARY', 'Guest Name': '', 'Vehicle Type': '', 'Vehicle No': '', 'Pickup': '', 'Drop': '', 'Trip Type': '', 'Package': '', 'Actual KMs': 0, 'Actual Hrs': 0, 'Package KMs': 0, 'Package Rate (₹)': 0, 'Extra KMs': 0, 'Extra KM Rate': 0, 'Extra KM Amount (₹)': 0, 'Extra Hrs': 0, 'Extra Hr Amount (₹)': 0, 'Hire Charges (₹)': inv.subtotal, 'Toll (₹)': 0, 'Parking (₹)': 0, 'Permit (₹)': 0, 'Bata (₹)': 0, 'GST Taxable (₹)': inv.subtotal, 'CGST (₹)': inv.cgst_amount, 'SGST (₹)': inv.sgst_amount, 'IGST (₹)': inv.igst_amount, 'Line Total (₹)': inv.grand_total })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${inv.invoice_number ?? 'DRAFT'}`)
    XLSX.writeFile(wb, `${inv.invoice_number ?? 'DRAFT'}.xlsx`)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading invoice…</div>
  if (!inv) return <div className="p-8 text-center text-gray-400">Invoice not found</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/billing/invoices')} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{inv.invoice_number ?? <span className="text-gray-400 italic">DRAFT</span>}</h1>
            <p className="text-sm text-gray-500">
              {inv.addressee_name
                ? <><span className="font-medium text-gray-700">{inv.addressee_prefix ? inv.addressee_prefix + ' ' : ''}{inv.addressee_name}</span>{inv.addressee_designation && <span className="text-gray-400"> · {inv.addressee_designation}</span>} · </>
                : null}
              {inv.company?.name} · {fmtDate(inv.period_from)} to {fmtDate(inv.period_to)}
            </p>
          </div>
          <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600')}>
            {inv.status.replace('_', ' ')}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/billing/invoices/${id}/pdf`, '_blank')} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" />Download PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />Excel
          </Button>
          {inv.status === 'draft' && (() => {
            const allReviewed = inv.line_items.length > 0 && inv.line_items.every(li => reviewedIds.has(li.id))
            const unreviewed = inv.line_items.length - reviewedIds.size
            return (
              <div title={!allReviewed ? `${unreviewed} trip${unreviewed !== 1 ? 's' : ''} not yet reviewed` : undefined}>
                <Button size="sm" onClick={markSent} disabled={!allReviewed}
                  className="gap-1.5 bg-green-700 hover:bg-green-800 text-white disabled:opacity-50 disabled:cursor-not-allowed">
                  <Check className="w-3.5 h-3.5" />Finalise Invoice
                </Button>
              </div>
            )
          })()}
          {(inv.status === 'sent' || inv.status === 'partially_paid' || inv.status === 'overdue') && (
            <Button size="sm" onClick={() => setShowPayment(true)} className="gap-1.5">
              <IndianRupee className="w-3.5 h-3.5" />Record Payment
            </Button>
          )}
          {['draft', 'sent', 'overdue', 'partially_paid'].includes(inv.status) && (
            <Button size="sm" variant="outline" onClick={() => setShowCancel(true)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
              Cancel Invoice
            </Button>
          )}
        </div>
      </div>

      {/* RCM notice */}
      {inv.reverse_charge && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm">
          <span className="font-bold">RCM</span>
          <span>Reverse Charge Mechanism — GST paid by client. No GST charged on this invoice.</span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Hire Charges', value: fmt(inv.subtotal) },
          { label: inv.igst_amount > 0 ? 'IGST (5%)' : 'GST (5%)', value: fmt(inv.igst_amount > 0 ? inv.igst_amount : inv.cgst_amount + inv.sgst_amount) },
          { label: 'Grand Total', value: fmt(inv.grand_total), highlight: true },
          { label: 'Balance Due', value: fmt(inv.balance_due), red: inv.balance_due > 0 },
        ].map(c => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.highlight ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-200')}>
            <div className={cn('text-xs font-medium mb-1', c.highlight ? 'text-blue-200' : 'text-gray-500')}>{c.label}</div>
            <div className={cn('text-xl font-bold', c.highlight ? 'text-white' : c.red ? 'text-orange-600' : 'text-gray-900')}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Trip Line Items */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Trip Details ({inv.line_items.length} trips)</h2>
          {inv.status === 'draft' && (
            <span className={cn(
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              reviewedIds.size === inv.line_items.length && inv.line_items.length > 0
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            )}>
              {reviewedIds.size} / {inv.line_items.length} reviewed
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                {inv.status === 'draft' && <th className="px-2 py-2 text-center w-8" title="Mark as reviewed">✓</th>}
                {['TS#', 'Date', 'Booking Ref', 'Guest', 'Cab No', 'Cab Type', 'KMs', 'Hrs/Days', 'Slab', 'Slab Rate', 'Ext Hrs', 'Ext Hr Rate', 'Ext Hr Amt', 'Ext KMs', 'Ext KM Rate', 'Ext KM Amt', 'Bata', 'Parking', 'Permit', 'Total'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {inv.line_items.map(li => {
                const isReviewed = reviewedIds.has(li.id)
                return (
                <tr key={li.id} className={cn(isReviewed ? 'bg-green-50/60' : 'hover:bg-gray-50')}>
                  {inv.status === 'draft' && (
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => toggleReviewed(li.id)}
                        title={isReviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                          isReviewed
                            ? 'bg-green-500 border-green-500 text-white'
                            : 'border-gray-300 hover:border-green-400'
                        )}
                      >
                        {isReviewed && <span className="text-[10px] font-bold leading-none">✓</span>}
                      </button>
                    </td>
                  )}
                  <td className="px-2 py-2 font-medium whitespace-nowrap">{li.tripsheet_number ?? '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{li.trip_date}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {inv.status === 'draft' && li.booking_id && li.trip_sheet_id ? (
                      <button
                        onClick={() => setTripsheetPopup({ lineItemId: li.id, bookingId: li.booking_id, tripSheetId: li.trip_sheet_id!, bookingRef: li.booking_ref, tripType: li.trip_type })}
                        className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                      >
                        {li.booking_ref}
                      </button>
                    ) : (
                      <span className="font-medium">{li.booking_ref}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 max-w-[110px] truncate">{li.guest_name ?? '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{li.vehicle_number ?? '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{li.vehicle_type}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{Number(li.actual_kms).toFixed(0)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">
                    {li.trip_type === 'outstation' ? `${Number(li.actual_hrs).toFixed(0)}D` : Number(li.actual_hrs).toFixed(0)}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{li.package_type}{li.package_kms > 0 ? `/${li.package_kms}` : ''}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{Number(li.package_rate).toFixed(0)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{Number(li.extra_hrs) > 0 ? Number(li.extra_hrs).toFixed(0) : '0'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{Number(li.extra_hr_rate).toFixed(0)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{li.extra_hr_amount > 0 ? fmt(li.extra_hr_amount) : '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{Number(li.extra_kms) > 0 ? Number(li.extra_kms).toFixed(0) : '0'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{Number(li.extra_km_rate).toFixed(0)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{li.extra_km_amount > 0 ? fmt(li.extra_km_amount) : '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{li.bata_amount > 0 ? fmt(li.bata_amount) : '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{(li.toll_amount + li.parking_amount) > 0 ? fmt(li.toll_amount + li.parking_amount) : '—'}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-right">{li.permit_amount > 0 ? fmt(li.permit_amount) : '—'}</td>
                  <td className="px-2 py-2 font-semibold whitespace-nowrap text-right">{fmt(li.line_total)}</td>
                </tr>
              )})}

            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={inv.status === 'draft' ? 7 : 6} className="px-2 py-2 font-semibold text-gray-700 text-right text-xs">Totals</td>
                <td colSpan={10} />
                <td className="px-2 py-2 font-bold text-right">{fmt(inv.subtotal)}</td>
                <td colSpan={2} className="px-2 py-2 font-semibold text-gray-500 text-xs">
                  {inv.cgst_amount > 0 ? `CGST ${fmt(inv.cgst_amount)} + SGST ${fmt(inv.sgst_amount)}` : `IGST ${fmt(inv.igst_amount)}`}
                  {inv.tds_amount > 0 ? ` − TDS ${fmt(inv.tds_amount)}` : ''}
                </td>
                <td className="px-2 py-2 font-bold text-blue-700 text-right">{fmt(inv.grand_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payments */}
      {inv.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b"><h2 className="text-sm font-semibold text-gray-700">Payments Received</h2></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              {['Date', 'Mode', 'Amount', 'TDS', 'Reference', 'Notes'].map(h => (
                <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {inv.payments.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">{fmtDate(p.payment_date)}</td>
                  <td className="px-4 py-2.5">{MODE_LABELS[p.payment_mode] ?? p.payment_mode}</td>
                  <td className="px-4 py-2.5 font-semibold text-green-700">{fmt(p.amount)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.tds_amount > 0 ? fmt(p.tds_amount) : '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.reference_number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400">{p.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inv.status === 'paid' && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <Check className="w-4 h-4" /><span className="font-semibold">Fully Paid</span>
        </div>
      )}

      {tripsheetPopup && (
        <TripsheetEditPopup
          bookingId={tripsheetPopup.bookingId}
          tripSheetId={tripsheetPopup.tripSheetId}
          bookingRef={tripsheetPopup.bookingRef}
          tripType={tripsheetPopup.tripType}
          invoiceId={id}
          lineItemId={tripsheetPopup.lineItemId}
          onClose={() => setTripsheetPopup(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['invoice', id] }); qc.invalidateQueries({ queryKey: ['invoices'] }); setTripsheetPopup(null) }}
        />
      )}

      {showPayment && <PaymentModal invoiceId={id} balanceDue={inv.balance_due} onClose={() => setShowPayment(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['invoice', id] }); qc.invalidateQueries({ queryKey: ['invoices'] }); setShowPayment(false) }} />}

      {showCancel && (
        <Dialog open onOpenChange={o => { if (!o) setShowCancel(false) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Cancel Invoice?</DialogTitle></DialogHeader>
            <div className="py-2 space-y-3">
              <p className="text-sm text-gray-700">
                This will mark <strong>{inv.invoice_number ?? 'this draft'}</strong> as cancelled.
                The invoice stays on record but cannot be paid or sent.
              </p>
              <p className="text-sm text-gray-500">
                You can generate a new corrected invoice for the same period afterwards.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancel(false)}>Keep Invoice</Button>
              <Button onClick={cancelInvoice} disabled={cancelling} className="bg-red-600 hover:bg-red-700 text-white">
                {cancelling ? 'Cancelling…' : 'Yes, Cancel Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
