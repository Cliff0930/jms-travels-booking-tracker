'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, FileText, Download, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { TripsheetEditPopup } from '@/components/billing/TripsheetEditPopup'

interface Invoice {
  id: string; invoice_number: string | null; company_id: string
  period_from: string; period_to: string; subtotal: number
  cgst_amount: number; sgst_amount: number; igst_amount: number
  tds_amount: number; grand_total: number; amount_paid: number; balance_due: number
  status: string; due_date: string | null; created_at: string
  company?: { name: string }
}

interface LineItemPreview {
  trip_date: string; booking_ref: string; booking_id: string; trip_sheet_id: string | null
  tripsheet_number: string | null; vehicle_type: string; vehicle_number: string | null
  guest_name: string | null; pickup_location: string | null; trip_type: string | null
  package_type: string; actual_kms: number; actual_hrs: number; package_kms: number; package_rate: number
  extra_kms: number; extra_km_rate: number; extra_km_amount: number
  extra_hrs: number; extra_hr_rate: number; extra_hr_amount: number
  hire_charges: number; toll_amount: number; parking_amount: number; permit_amount: number
  bata_amount: number; cgst_amount: number; sgst_amount: number; igst_amount: number; line_total: number
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
  partially_paid: 'bg-yellow-50 text-yellow-700',
  overdue: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function GenerateModal({ companies, onClose, onSaved }: {
  companies: { id: string; name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const router = useRouter()
  const [companyId, setCompanyId] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [isInterState, setIsInterState] = useState(false)
  const [reverseCharge, setReverseCharge] = useState(true)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<{ line_items: LineItemPreview[]; subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number; tds_amount: number; grand_total: number; trip_count: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tripsheetPopup, setTripsheetPopup] = useState<{ bookingId: string; tripSheetId: string; bookingRef: string; tripType: string | null } | null>(null)

  async function handlePreview() {
    if (!companyId || !periodFrom || !periodTo) { toast.error('Fill all fields'); return }
    setPreviewing(true)
    const res = await fetch('/api/billing/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company_id: companyId, period_from: periodFrom, period_to: periodTo, is_inter_state: isInterState, reverse_charge: reverseCharge }),
    })
    const data = await res.json()
    setPreview(data)
    setPreviewing(false)
  }

  async function handleSave() {
    if (!preview) return
    setSaving(true)
    const res = await fetch('/api/billing/invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...preview, company_id: companyId, period_from: periodFrom, period_to: periodTo, due_date: dueDate || null, notes: notes || null, reverse_charge: reverseCharge }),
    })
    if (res.ok) {
      const inv = await res.json()
      toast.success('Draft saved — review and finalise')
      onSaved()
      router.push(`/billing/invoices/${inv.id}`)
    } else {
      const errData = await res.json().catch(() => ({}))
      toast.error(errData.error ?? 'Failed to save draft')
    }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Generate Invoice</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Company *</Label>
              <select
                value={companyId}
                onChange={e => setCompanyId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period From *</Label>
              <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Period To *</Label>
              <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            {/* RCM toggle */}
            <div className="col-span-2 flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
              <div>
                <p className="text-sm font-semibold text-gray-800">Reverse Charge Mechanism (RCM)</p>
                <p className="text-xs text-gray-500 mt-0.5">Client pays GST directly. No GST added to invoice. (Most corporate clients.)</p>
              </div>
              <button
                type="button"
                onClick={() => setReverseCharge(v => !v)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors focus:outline-none',
                  reverseCharge ? 'bg-blue-700 border-blue-700' : 'bg-gray-200 border-gray-200'
                )}
              >
                <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', reverseCharge ? 'translate-x-5' : 'translate-x-0')} />
              </button>
            </div>

            {/* Interstate only shown when RCM is OFF */}
            {!reverseCharge && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="interstate" checked={isInterState} onChange={e => setIsInterState(e.target.checked)} />
                <Label htmlFor="interstate" className="text-sm">Inter-state client (IGST 5% instead of CGST+SGST)</Label>
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any invoice notes…" />
            </div>
          </div>

          <Button onClick={handlePreview} disabled={previewing || !companyId || !periodFrom || !periodTo} variant="outline" className="w-full">
            {previewing ? 'Calculating…' : 'Preview Invoice'}
          </Button>

          {preview && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm font-semibold">{preview.trip_count} trips found</span>
                <div className="text-sm text-gray-600 flex flex-wrap gap-4">
                  <span>Subtotal: <strong>{fmt(preview.subtotal)}</strong></span>
                  {preview.cgst_amount > 0 && <span>GST: <strong>{fmt(preview.cgst_amount + preview.sgst_amount)}</strong></span>}
                  {preview.igst_amount > 0 && <span>IGST: <strong>{fmt(preview.igst_amount)}</strong></span>}
                  {preview.tds_amount > 0 && <span>TDS: <strong>−{fmt(preview.tds_amount)}</strong></span>}
                  <span className="font-bold text-gray-900">Total: {fmt(preview.grand_total)}</span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[50vh]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b sticky top-0">
                    <tr>
                      {['TS#', 'Date', 'Booking Ref', 'Guest', 'Cab No', 'Cab Type', 'KMs', 'Hrs/Days', 'Slab', 'Slab Rate', 'Ext Hrs', 'Ext Hr Rate', 'Ext Hr Amt', 'Ext KMs', 'Ext KM Rate', 'Ext KM Amt', 'Bata', 'Parking', 'Permit', 'Total'].map(h => (
                        <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.line_items.map((li, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 font-medium whitespace-nowrap">{li.tripsheet_number ?? '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{li.trip_date}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {li.booking_id && li.trip_sheet_id ? (
                            <button
                              onClick={() => setTripsheetPopup({ bookingId: li.booking_id, tripSheetId: li.trip_sheet_id!, bookingRef: li.booking_ref, tripType: li.trip_type })}
                              className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium"
                            >
                              {li.booking_ref}
                            </button>
                          ) : (
                            <span className="text-gray-500">{li.booking_ref}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 max-w-[100px] truncate">{li.guest_name ?? '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{li.vehicle_number ?? '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{li.vehicle_type}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.actual_kms).toFixed(0)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">
                          {li.trip_type === 'outstation' ? `${Number(li.actual_hrs).toFixed(0)}D` : Number(li.actual_hrs).toFixed(0)}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{li.package_type}{li.package_kms > 0 ? `/${li.package_kms}` : ''}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.package_rate).toFixed(0)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.extra_hrs) > 0 ? Number(li.extra_hrs).toFixed(0) : '0'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.extra_hr_rate).toFixed(0)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{li.extra_hr_amount > 0 ? fmt(li.extra_hr_amount) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.extra_kms) > 0 ? Number(li.extra_kms).toFixed(0) : '0'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.extra_km_rate).toFixed(0)}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{li.extra_km_amount > 0 ? fmt(li.extra_km_amount) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{li.bata_amount > 0 ? fmt(li.bata_amount) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{(li.toll_amount + li.parking_amount) > 0 ? fmt(li.toll_amount + li.parking_amount) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">{li.permit_amount > 0 ? fmt(li.permit_amount) : '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-right">{fmt(li.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tripsheetPopup && (
            <TripsheetEditPopup
              bookingId={tripsheetPopup.bookingId}
              tripSheetId={tripsheetPopup.tripSheetId}
              bookingRef={tripsheetPopup.bookingRef}
              tripType={tripsheetPopup.tripType}
              onClose={() => setTripsheetPopup(null)}
              onSaved={() => { setTripsheetPopup(null); void handlePreview() }}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!preview || saving}>
            {saving ? 'Saving…' : 'Save as Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function InvoicesPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [view, setView] = useState<'list' | 'aged'>('list')
  const [search, setSearch] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', statusFilter],
    queryFn: () => fetch(`/api/billing/invoices${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`).then(r => r.json()),
  })
  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['companies-list'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices
    const q = search.toLowerCase()
    return invoices.filter(i => (i.invoice_number ?? '').toLowerCase().includes(q) || i.company?.name?.toLowerCase().includes(q))
  }, [invoices, search])

  const totalOutstanding = useMemo(() => invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((s, i) => s + Number(i.balance_due), 0), [invoices])

  // Aged receivables: group unpaid invoices by company
  const agedReceivables = useMemo(() => {
    const today = new Date()
    const unpaid = invoices.filter(i => Number(i.balance_due) > 0 && i.status !== 'cancelled')
    const map = new Map<string, { company_id: string; company_name: string; total: number; paid: number; balance: number; oldest: Date; invoices: Invoice[] }>()
    for (const inv of unpaid) {
      const cid = inv.company_id
      if (!map.has(cid)) map.set(cid, { company_id: cid, company_name: inv.company?.name ?? '—', total: 0, paid: 0, balance: 0, oldest: new Date(inv.created_at), invoices: [] })
      const row = map.get(cid)!
      row.total += Number(inv.grand_total)
      row.paid += Number(inv.amount_paid)
      row.balance += Number(inv.balance_due)
      if (new Date(inv.created_at) < row.oldest) row.oldest = new Date(inv.created_at)
      row.invoices.push(inv)
    }
    return Array.from(map.values())
      .map(r => ({ ...r, ageDays: Math.floor((today.getTime() - r.oldest.getTime()) / 86400000) }))
      .sort((a, b) => b.balance - a.balance)
  }, [invoices])

  function exportExcel() {
    const rows = filtered.map(i => ({
      'Invoice #': i.invoice_number ?? 'DRAFT',
      'Company': i.company?.name ?? '',
      'Period From': i.period_from,
      'Period To': i.period_to,
      'Subtotal (₹)': Number(i.subtotal),
      'CGST (₹)': Number(i.cgst_amount),
      'SGST (₹)': Number(i.sgst_amount),
      'IGST (₹)': Number(i.igst_amount),
      'TDS (₹)': Number(i.tds_amount),
      'Grand Total (₹)': Number(i.grand_total),
      'Amount Paid (₹)': Number(i.amount_paid),
      'Balance Due (₹)': Number(i.balance_due),
      'Status': i.status,
      'Due Date': i.due_date ?? '',
      'Created': fmtDate(i.created_at),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices')
    XLSX.writeFile(wb, `invoices-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Generate, track and manage client invoices"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
              <Download className="w-3.5 h-3.5" />Excel
            </Button>
            <Button size="sm" onClick={() => setShowGenerate(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Generate Invoice
            </Button>
          </div>
        }
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
          <button onClick={() => setView('list')}
            className={cn('px-3 py-2 font-semibold transition-colors', view === 'list' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
          >Invoices</button>
          <button onClick={() => setView('aged')}
            className={cn('px-3 py-2 font-semibold transition-colors', view === 'aged' ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
          >Aged Receivables</button>
        </div>
        {view === 'list' && <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
          {['all', 'draft', 'sent', 'paid', 'partially_paid', 'overdue'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-2 font-semibold capitalize transition-colors',
                statusFilter === s ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
            >{s.replace('_', ' ')}</button>
          ))}
        </div>}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoice, company…" className="pl-9 h-9 text-sm" />
        </div>
        {totalOutstanding > 0 && (
          <div className="ml-auto text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 font-semibold">
            Outstanding: ₹{totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        )}
      </div>

      {/* Aged Receivables view */}
      {view === 'aged' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Aged Receivables — Companies with Outstanding Balances</h2>
            <span className="text-xs text-gray-500">{agedReceivables.length} companies</span>
          </div>
          {agedReceivables.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No outstanding balances</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Company', 'Total Invoiced', 'Collected', 'Outstanding', 'Oldest Unpaid', 'Age'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agedReceivables.map(row => (
                  <tr key={row.company_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{row.company_name}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(row.total)}</td>
                    <td className="px-4 py-3 text-green-700">{fmt(row.paid)}</td>
                    <td className="px-4 py-3 font-bold text-orange-600">{fmt(row.balance)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.oldest.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', row.ageDays > 60 ? 'bg-red-50 text-red-700' : row.ageDays > 30 ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700')}>
                        {row.ageDays}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td className="px-4 py-3 font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-3 font-bold">{fmt(agedReceivables.reduce((s, r) => s + r.total, 0))}</td>
                  <td className="px-4 py-3 font-bold text-green-700">{fmt(agedReceivables.reduce((s, r) => s + r.paid, 0))}</td>
                  <td className="px-4 py-3 font-bold text-orange-600">{fmt(agedReceivables.reduce((s, r) => s + r.balance, 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Invoice list */}
      {view === 'list' && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No invoices found. Click "Generate Invoice" to create one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Invoice #', 'Company', 'Period', 'Grand Total', 'Paid', 'Balance', 'Status', 'Due', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/billing/invoices/${inv.id}`)}>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">{inv.invoice_number ? <span className="text-blue-700">{inv.invoice_number}</span> : <span className="text-gray-400 italic">Draft</span>}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{inv.company?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(inv.period_from)} — {fmtDate(inv.period_to)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(inv.grand_total)}</td>
                  <td className="px-4 py-3 text-green-700 whitespace-nowrap">{fmt(inv.amount_paid)}</td>
                  <td className="px-4 py-3 font-semibold text-orange-600 whitespace-nowrap">{fmt(inv.balance_due)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-500')}>
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <FileText className="w-4 h-4 text-gray-400 hover:text-blue-600" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}

      {showGenerate && <GenerateModal companies={companies} onClose={() => setShowGenerate(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['invoices'] }); setShowGenerate(false) }} />}
    </div>
  )
}
