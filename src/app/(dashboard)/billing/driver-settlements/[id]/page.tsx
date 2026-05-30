'use client'
import { use, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, Printer, Download, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'

interface TripRow {
  id: string; trip_date: string; booking_ref: string; company_name: string
  trip_type: string; vehicle_type: string; actual_kms: number; actual_hrs: number
  client_hire_charges: number; commission_percent: number; hire_earnings: number
  bata_count: number; driver_bata_rate: number; bata_earnings: number
  toll_amount: number; parking_amount: number; permit_amount: number; trip_total: number
}

interface SettlementDetail {
  id: string; driver_id: string; period_from: string; period_to: string
  total_trips: number; hire_earnings: number; bata_earnings: number
  reimbursements: number; salary_amount: number; gross_earnings: number
  advance_principal_deduction: number; advance_interest_deduction: number
  other_deductions: number; net_payable: number
  status: string; payment_mode: string | null; payment_reference: string | null
  paid_at: string | null; notes: string | null; created_at: string
  driver?: { id: string; name: string; vehicle_name: string; vehicle_number: string; phone: string }
  trips: TripRow[]
}

const MODE_LABELS: Record<string, string> = {
  cash: 'Cash', bank_transfer: 'Bank Transfer', upi: 'UPI',
  cheque: 'Cheque', neft: 'NEFT', rtgs: 'RTGS',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  paid: 'bg-green-50 text-green-700',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0.00'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function MarkPaidModal({
  settlementId, netPayable, onClose, onSaved,
}: { settlementId: string; netPayable: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    payment_mode: 'bank_transfer',
    payment_reference: '',
    paid_at: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/billing/driver-settlements/${settlementId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'paid',
        payment_mode: form.payment_mode,
        payment_reference: form.payment_reference || null,
        paid_at: form.paid_at ? new Date(form.paid_at).toISOString() : new Date().toISOString(),
        notes: form.notes || null,
      }),
    })
    if (res.ok) { toast.success('Marked as paid'); onSaved() }
    else toast.error('Failed to update')
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark as Paid</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
            Net payable: <strong>{fmt(netPayable)}</strong>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Payment Mode *</Label>
              <Select value={form.payment_mode} onValueChange={(v: string | null) => setForm(f => ({ ...f, payment_mode: v ?? '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MODE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Date *</Label>
              <Input type="date" value={form.paid_at} onChange={e => setForm(f => ({ ...f, paid_at: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reference / UTR / Cheque No.</Label>
            <Input value={form.payment_reference} onChange={e => setForm(f => ({ ...f, payment_reference: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-green-700 hover:bg-green-800 text-white">
            {saving ? 'Saving…' : 'Confirm Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function DriverSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const [showPaid, setShowPaid] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: s, isLoading } = useQuery<SettlementDetail>({
    queryKey: ['driver-settlement', id],
    queryFn: () => fetch(`/api/billing/driver-settlements/${id}`).then(r => r.json()),
    enabled: !!id,
  })

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/billing/driver-settlements/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Statement deleted')
      router.push('/billing/driver-settlements')
    } else {
      toast.error('Failed to delete')
    }
    setDeleting(false)
  }

  function exportExcel() {
    if (!s) return
    const rows = s.trips.map((t, i) => ({
      '#': i + 1,
      'Date': t.trip_date,
      'Booking Ref': t.booking_ref,
      'Company': t.company_name,
      'KMs': t.actual_kms,
      'Hrs': t.actual_hrs,
      'Client Hire (₹)': t.client_hire_charges,
      'Comm %': t.commission_percent,
      'Driver Share (₹)': t.hire_earnings,
      'Bata Count': t.bata_count,
      'Bata Rate (₹)': t.driver_bata_rate,
      'Bata (₹)': t.bata_earnings,
      'Toll (₹)': t.toll_amount,
      'Parking (₹)': t.parking_amount,
      'Permit (₹)': t.permit_amount,
      'Trip Total (₹)': t.trip_total,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Driver Statement')
    XLSX.writeFile(wb, `driver-statement-${s.driver?.name ?? id}-${s.period_from}.xlsx`)
  }

  if (isLoading) return <div className="p-8 text-center text-gray-400">Loading…</div>
  if (!s) return <div className="p-8 text-center text-gray-400">Statement not found</div>

  const totalDeductions = Number(s.advance_principal_deduction) + Number(s.advance_interest_deduction) + Number(s.other_deductions)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push('/billing/driver-settlements')} className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{s.driver?.name ?? '—'}</h1>
            <p className="text-sm text-gray-500">
              {s.driver?.vehicle_name} · {fmtDate(s.period_from)} to {fmtDate(s.period_to)} · {s.total_trips} trips
            </p>
          </div>
          <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-600')}>
            {s.status}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/billing/driver-settlements/${id}/pdf`, '_blank')} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />Excel
          </Button>
          {s.status === 'draft' && (
            <>
              <Button size="sm" onClick={() => setShowPaid(true)} className="gap-1.5 bg-green-700 hover:bg-green-800 text-white">
                <Check className="w-3.5 h-3.5" />Mark as Paid
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowDelete(true)} className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-3.5 h-3.5" />Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Paid banner */}
      {s.status === 'paid' && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          <Check className="w-4 h-4 shrink-0" />
          <span>
            <strong>Paid</strong>
            {s.paid_at ? ` on ${fmtDate(s.paid_at)}` : ''}
            {s.payment_mode ? ` via ${MODE_LABELS[s.payment_mode] ?? s.payment_mode}` : ''}
            {s.payment_reference ? ` · Ref: ${s.payment_reference}` : ''}
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Hire Earnings', value: fmt(s.hire_earnings) },
          { label: 'Bata + Salary + Reimb', value: fmt(Number(s.bata_earnings) + Number(s.salary_amount) + Number(s.reimbursements)) },
          { label: 'Total Deductions', value: fmt(totalDeductions), red: totalDeductions > 0 },
          { label: 'Net Payable', value: fmt(s.net_payable), highlight: true },
        ].map(c => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.highlight ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-200')}>
            <div className={cn('text-xs font-medium mb-1', c.highlight ? 'text-blue-200' : 'text-gray-500')}>{c.label}</div>
            <div className={cn('text-xl font-bold', c.highlight ? 'text-white' : (c as { red?: boolean }).red ? 'text-orange-600' : 'text-gray-900')}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Trip table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Trip Details ({s.trips.length} trips)</h2>
        </div>
        {s.trips.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">No trip details recorded for this statement.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['#', 'Date', 'Ref', 'Company', 'KMs', 'Hire Chg', 'Comm%', 'Driver Share', 'Bata', 'Reimb', 'Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {s.trips.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.trip_date}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{t.booking_ref}</td>
                    <td className="px-3 py-2 max-w-[120px] truncate">{t.company_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.actual_kms}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(t.client_hire_charges)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-red-500">{t.commission_percent}%</td>
                    <td className="px-3 py-2 font-medium text-blue-700 whitespace-nowrap">{fmt(t.hire_earnings)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(t.bata_earnings)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmt(t.toll_amount + t.parking_amount + t.permit_amount)}</td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{fmt(t.trip_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={7} className="px-3 py-2 font-semibold text-gray-700 text-right text-xs">Totals</td>
                  <td className="px-3 py-2 font-bold text-blue-700">{fmt(s.hire_earnings)}</td>
                  <td className="px-3 py-2 font-bold">{fmt(s.bata_earnings)}</td>
                  <td className="px-3 py-2 font-bold">{fmt(s.reimbursements)}</td>
                  <td className="px-3 py-2 font-bold">{fmt(s.gross_earnings)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Settlement summary */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Settlement Summary</h2>
        </div>
        <div className="p-4 space-y-2 text-sm max-w-sm">
          <div className="flex justify-between text-gray-600">
            <span>Hire Earnings</span><span className="font-medium text-gray-900">{fmt(s.hire_earnings)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Bata Earnings</span><span className="font-medium text-gray-900">{fmt(s.bata_earnings)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Reimbursements</span><span className="font-medium text-gray-900">{fmt(s.reimbursements)}</span>
          </div>
          {Number(s.salary_amount) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Monthly Salary</span><span className="font-medium text-gray-900">{fmt(s.salary_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-2 text-gray-900">
            <span>Gross Earnings</span><span>{fmt(s.gross_earnings)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Advance Deduction</span><span>−{fmt(s.advance_principal_deduction)}</span>
          </div>
          <div className="flex justify-between text-red-600">
            <span>Advance Interest</span><span>−{fmt(s.advance_interest_deduction)}</span>
          </div>
          {Number(s.other_deductions) > 0 && (
            <div className="flex justify-between text-red-600">
              <span>Other Deductions</span><span>−{fmt(s.other_deductions)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold border-t-2 border-gray-800 pt-2 text-green-700 text-base">
            <span>NET PAYABLE</span><span>{fmt(s.net_payable)}</span>
          </div>
        </div>
        {s.notes && (
          <div className="px-4 pb-4 text-sm text-gray-500 italic border-t">{s.notes}</div>
        )}
      </div>

      {showPaid && (
        <MarkPaidModal
          settlementId={id}
          netPayable={Number(s.net_payable)}
          onClose={() => setShowPaid(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['driver-settlement', id] })
            qc.invalidateQueries({ queryKey: ['driver-settlements'] })
            setShowPaid(false)
          }}
        />
      )}

      {showDelete && (
        <Dialog open onOpenChange={o => { if (!o) setShowDelete(false) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete Statement?</DialogTitle></DialogHeader>
            <div className="py-2 text-sm text-gray-700 space-y-2">
              <p>This will permanently delete the driver statement for <strong>{s.driver?.name}</strong> ({fmtDate(s.period_from)} — {fmtDate(s.period_to)}).</p>
              <p className="text-gray-500">You can regenerate it afterwards if needed.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
                {deleting ? 'Deleting…' : 'Delete Statement'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
