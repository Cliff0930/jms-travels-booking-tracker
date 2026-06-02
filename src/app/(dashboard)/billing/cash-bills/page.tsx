'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CashBill {
  id: string; bill_number: string | null; client_id: string | null; client_name: string
  period_from: string; period_to: string; subtotal: number; total: number
  payment_mode: string; status: string; created_at: string
  client?: { name: string; prefix: string | null; primary_phone: string | null } | null
}

interface LineItemPreview {
  booking_id: string; trip_sheet_id: string | null; trip_date: string; booking_ref: string
  vehicle_type: string; vehicle_number: string | null; guest_name: string | null
  trip_type: string | null; actual_kms: number; actual_hrs: number
  package_type: string; package_kms: number; package_rate: number
  extra_kms: number; extra_km_rate: number; extra_km_amount: number
  extra_hrs: number; extra_hr_rate: number; extra_hr_amount: number
  hire_charges: number; toll_amount: number; parking_amount: number; bata_amount: number
  line_total: number
}

interface EligibleClient { id: string; name: string; prefix: string | null; primary_phone: string | null }

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-50 text-blue-700',
  paid: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

const PAYMENT_MODES = ['cash', 'upi', 'bank_transfer', 'cheque']
const PAYMENT_LABELS: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer', cheque: 'Cheque' }

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function GenerateCashBillModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const router = useRouter()
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<EligibleClient[]>([])
  const [clientOpen, setClientOpen] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [paymentMode, setPaymentMode] = useState('cash')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<{
    line_items: LineItemPreview[]; missed_line_items: LineItemPreview[]
    subtotal: number; total: number; trip_count: number; missed_count: number
  } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  async function searchClients(q: string) {
    if (!q || q.length < 2) { setClientResults([]); return }
    const res = await fetch(`/api/clients?q=${encodeURIComponent(q)}&client_type=guest`)
    const data = await res.json()
    setClientResults(Array.isArray(data) ? data.slice(0, 8) : [])
  }

  async function handlePreview() {
    if (!periodFrom || !periodTo) { toast.error('Select period dates'); return }
    const name = clientName.trim()
    if (!name) { toast.error('Enter or select a client name'); return }
    setPreviewing(true)
    const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo })
    if (clientId) params.set('client_id', clientId)
    const res = await fetch(`/api/billing/cash-bills/generate?${params}`)
    const data = await res.json()
    setPreview(data)
    setSelectedIds(new Set<string>([
      ...(data.line_items ?? []).map((li: LineItemPreview) => li.booking_id),
      ...(data.missed_line_items ?? []).map((li: LineItemPreview) => li.booking_id),
    ]))
    setPreviewing(false)
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const selectedItems = useMemo(() => {
    if (!preview) return []
    return [...preview.line_items, ...(preview.missed_line_items ?? [])].filter(li => selectedIds.has(li.booking_id))
  }, [preview, selectedIds])

  const selTotals = useMemo(() => {
    const sub = selectedItems.reduce((s, li) => s + Number(li.hire_charges), 0)
    const ext = selectedItems.reduce((s, li) => s + Number(li.toll_amount) + Number(li.parking_amount) + Number(li.bata_amount), 0)
    return { sub: Math.round(sub * 100) / 100, total: Math.round((sub + ext) * 100) / 100 }
  }, [selectedItems])

  async function handleSave() {
    if (!preview || selectedItems.length === 0) { toast.error('Select at least one trip'); return }
    setSaving(true)
    const res = await fetch('/api/billing/cash-bills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId || null,
        client_name: clientName.trim(),
        period_from: periodFrom, period_to: periodTo,
        payment_mode: paymentMode,
        notes: notes || null,
        subtotal: selTotals.sub, total: selTotals.total,
        line_items: selectedItems,
      }),
    })
    if (res.ok) {
      const bill = await res.json()
      toast.success('Cash bill saved as draft')
      onSaved()
      router.push(`/billing/cash-bills/${bill.id}`)
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? 'Failed to save')
    }
    setSaving(false)
  }

  function renderRows(items: LineItemPreview[], isMissed = false) {
    return items.map((li, i) => {
      const checked = selectedIds.has(li.booking_id)
      return (
        <tr key={i} className={cn(!checked && 'opacity-40', isMissed ? 'bg-amber-50/40' : 'hover:bg-gray-50')}>
          <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={checked} onChange={() => toggleOne(li.booking_id)} className="cursor-pointer" /></td>
          <td className="px-2 py-1.5 font-medium whitespace-nowrap text-xs">{li.trip_date}</td>
          <td className="px-2 py-1.5 whitespace-nowrap text-xs">{li.booking_ref}</td>
          <td className="px-2 py-1.5 whitespace-nowrap text-xs">{li.vehicle_number ?? '—'}</td>
          <td className="px-2 py-1.5 whitespace-nowrap text-xs">{li.vehicle_type}</td>
          <td className="px-2 py-1.5 text-right whitespace-nowrap text-xs">{Number(li.actual_kms).toFixed(0)}</td>
          <td className="px-2 py-1.5 text-right whitespace-nowrap text-xs">{li.trip_type === 'outstation' ? `${Number(li.actual_hrs).toFixed(0)}D` : Number(li.actual_hrs).toFixed(0)}</td>
          <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap text-xs">{fmt(li.hire_charges)}</td>
          <td className="px-2 py-1.5 text-right whitespace-nowrap text-xs">{(li.toll_amount + li.parking_amount) > 0 ? fmt(li.toll_amount + li.parking_amount) : '—'}</td>
          <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap text-xs">{fmt(li.line_total)}</td>
        </tr>
      )
    })
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent style={{ width: '90vw', maxWidth: '90vw' }} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Generate Cash Bill</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            {/* Client search */}
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Client (search or enter name)</Label>
              <div className="relative">
                <input type="text" placeholder="Search by name or phone…"
                  value={clientId ? clientName : clientSearch}
                  onChange={e => { setClientSearch(e.target.value); setClientId(''); setClientName(e.target.value); setClientOpen(true); searchClients(e.target.value) }}
                  onFocus={() => setClientOpen(true)}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                {clientOpen && clientResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {clientResults.map(c => (
                      <button key={c.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex flex-col"
                        onClick={() => { setClientId(c.id); setClientName((c.prefix ? c.prefix + ' ' : '') + c.name); setClientSearch(''); setClientOpen(false) }}>
                        <span className="font-medium">{c.prefix ? c.prefix + ' ' : ''}{c.name}</span>
                        {c.primary_phone && <span className="text-xs text-gray-400">{c.primary_phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!clientId && <p className="text-xs text-gray-400">Not in directory? Just type the name directly.</p>}
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
              <Label className="text-xs">Payment Mode</Label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                {PAYMENT_MODES.map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes…" />
            </div>

            <div className="col-span-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-xs text-green-700 font-medium">
              Cash bills do NOT include GST — they are not tax invoices and will not appear in GST reports.
            </div>
          </div>

          <Button onClick={handlePreview} disabled={previewing || !periodFrom || !periodTo} variant="outline" className="w-full">
            {previewing ? 'Loading trips…' : 'Preview Trips'}
          </Button>

          {preview && (
            <div className="space-y-3">
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">{preview.trip_count} personal trips in period</span>
                  <span className="text-sm text-gray-600">{selectedItems.length} selected · <strong>{fmt(selTotals.total)}</strong></span>
                </div>
                {preview.line_items.length === 0
                  ? <div className="p-6 text-center text-sm text-gray-400">No unbilled personal trips found for this period</div>
                  : <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>{['', 'Date', 'Ref', 'Cab No', 'Type', 'KMs', 'Hrs', 'Hire', 'Extras', 'Total'].map(h => (
                            <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">{renderRows(preview.line_items)}</tbody>
                      </table>
                    </div>}
              </div>
              {(preview.missed_line_items ?? []).length > 0 && (
                <div className="border border-amber-300 rounded-xl overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2 text-amber-800 font-semibold text-sm">
                    ⚠️ {preview.missed_count} unbilled personal trips from earlier periods
                  </div>
                  <div className="overflow-x-auto max-h-[30vh]">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-100 border-b sticky top-0">
                        <tr>{['', 'Date', 'Ref', 'Cab No', 'Type', 'KMs', 'Hrs', 'Hire', 'Extras', 'Total'].map(h => (
                          <th key={h} className="px-2 py-2 text-left font-semibold text-amber-700 whitespace-nowrap">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-amber-50">{renderRows(preview.missed_line_items ?? [], true)}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {selectedItems.length > 0 && (
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? 'Saving…' : `Save Cash Bill (${selectedItems.length} trips · ${fmt(selTotals.total)})`}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function CashBillsPage() {
  const qc = useQueryClient()
  const [showGenerate, setShowGenerate] = useState(false)
  const [search, setSearch] = useState('')

  const { data: bills = [], isLoading } = useQuery<CashBill[]>({
    queryKey: ['cash-bills'],
    queryFn: () => fetch('/api/billing/cash-bills').then(r => r.json()),
  })

  const filtered = bills.filter(b =>
    !search || b.client_name.toLowerCase().includes(search.toLowerCase()) || (b.bill_number ?? '').includes(search)
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Cash Bills" description="Personal trip receipts (no GST)" />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9 w-64" placeholder="Search client or bill no…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setShowGenerate(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Generate Cash Bill
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Bill No.', 'Client', 'Period', 'Total', 'Payment', 'Status', 'Date'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No cash bills yet. Click "Generate Cash Bill" to create one.</td></tr>
            )}
            {filtered.map(b => (
              <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => window.location.href = `/billing/cash-bills/${b.id}`}>
                <td className="px-4 py-3 font-mono font-semibold text-blue-700 whitespace-nowrap">{b.bill_number ?? <span className="text-gray-400 italic text-xs">DRAFT</span>}</td>
                <td className="px-4 py-3 font-medium">{b.client_name}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(b.period_from)} — {fmtDate(b.period_to)}</td>
                <td className="px-4 py-3 font-semibold">{fmt(b.total)}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{PAYMENT_LABELS[b.payment_mode] ?? b.payment_mode}</td>
                <td className="px-4 py-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[b.status] ?? 'bg-gray-100 text-gray-600')}>
                    {b.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{fmtDate(b.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showGenerate && (
        <GenerateCashBillModal
          onClose={() => setShowGenerate(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['cash-bills'] }); setShowGenerate(false) }}
        />
      )}
    </div>
  )
}
