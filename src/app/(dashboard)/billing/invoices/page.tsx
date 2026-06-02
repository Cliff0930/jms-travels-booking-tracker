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
import { Plus, FileText, Download, Search, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { TripsheetEditPopup } from '@/components/billing/TripsheetEditPopup'

interface UnbilledAlert {
  company_id: string; company_name: string; month: string
  period_from: string; period_to: string; trip_count: number
}

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

interface EligibleIndividual {
  id: string; name: string; prefix: string | null; designation: string | null; primary_phone: string | null
}

function GenerateModal({ companies, onClose, onSaved, prefill }: {
  companies: { id: string; name: string }[]; onClose: () => void; onSaved: () => void
  prefill?: { companyId: string; periodFrom: string; periodTo: string }
}) {
  const router = useRouter()
  // Bill mode: 'company' (corporate GST) or 'individual' (walk-in GST, no company)
  const [billMode, setBillMode] = useState<'company' | 'individual'>(prefill ? 'company' : 'company')
  const [companyId, setCompanyId] = useState(prefill?.companyId ?? '')
  const [periodFrom, setPeriodFrom] = useState(prefill?.periodFrom ?? '')
  const [periodTo, setPeriodTo] = useState(prefill?.periodTo ?? '')
  const [isInterState, setIsInterState] = useState(false)
  const [reverseCharge, setReverseCharge] = useState(true)
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  // Within-company individual (existing feature)
  const [billToIndividual, setBillToIndividual] = useState(false)
  const [individuals, setIndividuals] = useState<EligibleIndividual[]>([])
  const [guestClientId, setGuestClientId] = useState('')
  const [indSearch, setIndSearch] = useState('')
  const [indOpen, setIndOpen] = useState(false)
  // Walk-in individual (new: no company, GST invoice)
  const [walkInSearch, setWalkInSearch] = useState('')
  const [walkInResults, setWalkInResults] = useState<EligibleIndividual[]>([])
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInClientId, setWalkInClientId] = useState('')
  const [walkInName, setWalkInName] = useState('')
  const [walkInGstin, setWalkInGstin] = useState('')
  const [walkInAddress, setWalkInAddress] = useState('')
  const [preview, setPreview] = useState<{
    line_items: LineItemPreview[]; missed_line_items: LineItemPreview[]
    subtotal: number; cgst_amount: number; sgst_amount: number; igst_amount: number
    tds_amount: number; tds_percent: number; grand_total: number; trip_count: number; missed_count: number
    guest_client: { name: string; prefix: string | null; designation: string | null } | null
    individual_client: { name: string; prefix: string | null; designation: string | null; primary_phone: string | null } | null
  } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [tripsheetPopup, setTripsheetPopup] = useState<{ bookingId: string; tripSheetId: string; bookingRef: string; tripType: string | null } | null>(null)

  const selectedIndividual = individuals.find(i => i.id === guestClientId) ?? null

  const filteredIndividuals = individuals.filter(i => {
    if (!indSearch) return true
    const q = indSearch.toLowerCase()
    return i.name.toLowerCase().includes(q) || (i.primary_phone ?? '').includes(q)
  })

  async function loadIndividuals(cId: string, from: string, to: string) {
    if (!cId || !from || !to) { setIndividuals([]); return }
    const res = await fetch(`/api/billing/generate/individuals?company_id=${cId}&period_from=${from}&period_to=${to}`)
    const data = await res.json()
    setIndividuals(Array.isArray(data) ? data : [])
  }

  async function searchWalkIn(q: string) {
    if (!q || q.length < 2) { setWalkInResults([]); return }
    const res = await fetch(`/api/clients?q=${encodeURIComponent(q)}&client_type=guest`)
    const data = await res.json()
    setWalkInResults(Array.isArray(data) ? data.slice(0, 8) : [])
  }

  async function handlePreview() {
    if (!periodFrom || !periodTo) { toast.error('Select period dates'); return }
    if (billMode === 'company' && !companyId) { toast.error('Select a company'); return }
    if (billMode === 'individual' && !walkInName.trim() && !walkInClientId) { toast.error('Enter client name or select from directory'); return }
    if (billMode === 'company' && billToIndividual && !guestClientId) { toast.error('Select an individual or uncheck Bill to individual'); return }
    setPreviewing(true)
    const body: Record<string, unknown> = { period_from: periodFrom, period_to: periodTo, is_inter_state: isInterState, reverse_charge: billMode === 'individual' ? false : reverseCharge }
    if (billMode === 'company') {
      body.company_id = companyId
      if (billToIndividual && guestClientId) body.guest_client_id = guestClientId
    } else {
      if (walkInClientId) body.individual_client_id = walkInClientId
    }
    const res = await fetch('/api/billing/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
  function toggleGroup(items: LineItemPreview[], checked: boolean) {
    setSelectedIds(prev => { const n = new Set(prev); items.forEach(li => checked ? n.add(li.booking_id) : n.delete(li.booking_id)); return n })
  }

  const selectedItems = useMemo(() => {
    if (!preview) return []
    return [...preview.line_items, ...(preview.missed_line_items ?? [])].filter(li => selectedIds.has(li.booking_id))
  }, [preview, selectedIds])

  const selTotals = useMemo(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100
    const sub  = selectedItems.reduce((s, li) => s + Number(li.hire_charges), 0)
    const cgst = selectedItems.reduce((s, li) => s + Number(li.cgst_amount), 0)
    const sgst = selectedItems.reduce((s, li) => s + Number(li.sgst_amount), 0)
    const igst = selectedItems.reduce((s, li) => s + Number(li.igst_amount), 0)
    const ext  = selectedItems.reduce((s, li) => s + Number(li.toll_amount) + Number(li.parking_amount) + Number(li.permit_amount) + Number(li.bata_amount), 0)
    const raw  = Math.round(sub + ext + cgst + sgst + igst)
    const tds  = r2(raw * (preview?.tds_percent ?? 0) / 100)
    return { sub: r2(sub), cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), tds, grand: r2(raw - tds) }
  }, [selectedItems, preview])

  async function handleSave() {
    if (!preview) return
    if (selectedItems.length === 0) { toast.error('Select at least one trip'); return }
    setSaving(true)
    const res = await fetch('/api/billing/invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(billMode === 'company' ? { company_id: companyId } : {}),
        period_from: periodFrom, period_to: periodTo,
        due_date: dueDate || null, notes: notes || null,
        reverse_charge: billMode === 'individual' ? false : reverseCharge,
        is_inter_state: isInterState,
        tds_percent: preview.tds_percent,
        ...(billMode === 'company' && billToIndividual && guestClientId ? {
          guest_client_id: guestClientId,
          addressee_prefix: selectedIndividual?.prefix ?? null,
          addressee_name: selectedIndividual?.name ?? null,
          addressee_designation: selectedIndividual?.designation ?? null,
        } : {}),
        ...(billMode === 'individual' ? {
          individual_client_id: walkInClientId || null,
          addressee_name: walkInName.trim() || preview.individual_client?.name || null,
          individual_gstin: walkInGstin.trim() || null,
          individual_address: walkInAddress.trim() || null,
        } : {}),
        line_items: selectedItems,
        subtotal: selTotals.sub, cgst_amount: selTotals.cgst, sgst_amount: selTotals.sgst,
        igst_amount: selTotals.igst, tds_amount: selTotals.tds, grand_total: selTotals.grand,
      }),
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

  function renderTripRows(items: LineItemPreview[], isMissed = false) {
    return items.map((li, i) => {
      const checked = selectedIds.has(li.booking_id)
      return (
        <tr key={i} className={cn(!checked && 'opacity-40', isMissed ? 'bg-amber-50/40' : 'hover:bg-gray-50')}>
          <td className="px-2 py-1.5 text-center">
            <input type="checkbox" checked={checked} onChange={() => toggleOne(li.booking_id)} className="cursor-pointer" />
          </td>
          <td className="px-2 py-1.5 font-medium whitespace-nowrap">{li.tripsheet_number ?? '—'}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">{li.trip_date}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">
            {li.booking_id && li.trip_sheet_id
              ? <button onClick={() => setTripsheetPopup({ bookingId: li.booking_id, tripSheetId: li.trip_sheet_id!, bookingRef: li.booking_ref, tripType: li.trip_type })} className="text-blue-600 hover:text-blue-800 underline underline-offset-2 font-medium">{li.booking_ref}</button>
              : <span className="text-gray-500">{li.booking_ref}</span>}
          </td>
          <td className="px-2 py-1.5 max-w-[100px] truncate">{li.guest_name ?? '—'}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">{li.vehicle_number ?? '—'}</td>
          <td className="px-2 py-1.5 whitespace-nowrap">{li.vehicle_type}</td>
          <td className="px-2 py-1.5 whitespace-nowrap text-right">{Number(li.actual_kms).toFixed(0)}</td>
          <td className="px-2 py-1.5 whitespace-nowrap text-right">{li.trip_type === 'outstation' ? `${Number(li.actual_hrs).toFixed(0)}D` : Number(li.actual_hrs).toFixed(0)}</td>
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
      )
    })
  }

  function renderTableHead(items: LineItemPreview[], isMissed = false) {
    const allChecked = items.length > 0 && items.every(li => selectedIds.has(li.booking_id))
    const someChecked = items.some(li => selectedIds.has(li.booking_id))
    return (
      <thead className={cn('border-b sticky top-0', isMissed ? 'bg-amber-100' : 'bg-gray-50')}>
        <tr>
          <th className="px-2 py-2 text-center">
            <input type="checkbox" checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
              onChange={e => toggleGroup(items, e.target.checked)} className="cursor-pointer" />
          </th>
          {['TS#', 'Date', 'Booking Ref', 'Guest', 'Cab No', 'Cab Type', 'KMs', 'Hrs/Days', 'Slab', 'Slab Rate', 'Ext Hrs', 'Ext Hr Rate', 'Ext Hr Amt', 'Ext KMs', 'Ext KM Rate', 'Ext KM Amt', 'Bata', 'Parking', 'Permit', 'Total'].map(h => (
            <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
          ))}
        </tr>
      </thead>
    )
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent style={{ width: '95vw', maxWidth: '95vw' }} className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Generate Invoice</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* Bill mode toggle */}
          <div className="flex gap-0 rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            {(['company', 'individual'] as const).map(mode => (
              <button key={mode} type="button"
                onClick={() => { setBillMode(mode); setPreview(null); setSelectedIds(new Set()) }}
                className={cn('flex-1 py-2 transition-colors', billMode === mode ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>
                {mode === 'company' ? 'Corporate GST Invoice' : 'Individual / Walk-in GST'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {billMode === 'company' ? (
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Company *</Label>
                <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ) : (
              <>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Client (search by name or phone)</Label>
                  <div className="relative">
                    <input type="text" placeholder="Search client…"
                      value={walkInClientId ? walkInName : walkInSearch}
                      onChange={e => { setWalkInSearch(e.target.value); setWalkInClientId(''); setWalkInOpen(true); searchWalkIn(e.target.value) }}
                      onFocus={() => { if (!walkInClientId) setWalkInOpen(true) }}
                      className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    {walkInOpen && walkInResults.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {walkInResults.map(c => (
                          <button key={c.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex flex-col"
                            onClick={() => { setWalkInClientId(c.id); setWalkInName((c.prefix ? c.prefix + ' ' : '') + c.name); setWalkInSearch(''); setWalkInOpen(false) }}>
                            <span className="font-medium">{c.prefix ? c.prefix + ' ' : ''}{c.name}</span>
                            {c.primary_phone && <span className="text-xs text-gray-400">{c.primary_phone}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Not in directory? Just type the name manually and fill GSTIN below.</p>
                </div>
                {!walkInClientId && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Client Name *</Label>
                    <Input value={walkInName} onChange={e => setWalkInName(e.target.value)} placeholder="e.g. Mr. Rahul Sharma" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">GSTIN (optional)</Label>
                  <Input value={walkInGstin} onChange={e => setWalkInGstin(e.target.value)} placeholder="29AXXXX…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address (optional)</Label>
                  <Input value={walkInAddress} onChange={e => setWalkInAddress(e.target.value)} placeholder="Billing address" />
                </div>
              </>
            )}
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
            {billMode === 'company' && (
              <>
                <div className="col-span-2 flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Reverse Charge Mechanism (RCM)</p>
                    <p className="text-xs text-gray-500 mt-0.5">Client pays GST directly. No GST added to invoice. (Most corporate clients.)</p>
                  </div>
                  <button type="button" onClick={() => setReverseCharge(v => !v)}
                    className={cn('relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 transition-colors focus:outline-none',
                      reverseCharge ? 'bg-blue-700 border-blue-700' : 'bg-gray-200 border-gray-200')}>
                    <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', reverseCharge ? 'translate-x-5' : 'translate-x-0')} />
                  </button>
                </div>
                {!reverseCharge && (
                  <div className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" id="interstate" checked={isInterState} onChange={e => setIsInterState(e.target.checked)} />
                    <Label htmlFor="interstate" className="text-sm">Inter-state client (IGST 5% instead of CGST+SGST)</Label>
                  </div>
                )}
              </>
            )}
            {billMode === 'individual' && (
              <div className="col-span-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700">
                GST will be charged at 5% (CGST 2.5% + SGST 2.5%). Client pays at the time of billing. No RCM.
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any invoice notes…" />
            </div>

            {/* Bill to individual */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="billToInd" checked={billToIndividual}
                  onChange={e => {
                    setBillToIndividual(e.target.checked)
                    setGuestClientId('')
                    setIndSearch('')
                    if (e.target.checked) loadIndividuals(companyId, periodFrom, periodTo)
                  }} />
                <Label htmlFor="billToInd" className="text-sm font-medium">Bill to individual (guest/employee)</Label>
              </div>
              {billToIndividual && (
                <div className="relative">
                  <input
                    type="text"
                    value={selectedIndividual ? `${selectedIndividual.prefix ? selectedIndividual.prefix + ' ' : ''}${selectedIndividual.name}${selectedIndividual.designation ? ' · ' + selectedIndividual.designation : ''}` : indSearch}
                    onChange={e => { setIndSearch(e.target.value); setGuestClientId(''); setIndOpen(true) }}
                    onFocus={() => { if (!guestClientId) setIndOpen(true) }}
                    placeholder="Search by name or phone…"
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {indOpen && filteredIndividuals.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredIndividuals.map(ind => (
                        <button key={ind.id} type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex flex-col"
                          onClick={() => { setGuestClientId(ind.id); setIndSearch(''); setIndOpen(false) }}>
                          <span className="font-medium">{ind.prefix ? ind.prefix + ' ' : ''}{ind.name}</span>
                          {ind.designation && <span className="text-xs text-gray-500">{ind.designation}</span>}
                          {ind.primary_phone && <span className="text-xs text-gray-400">{ind.primary_phone}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {indOpen && filteredIndividuals.length === 0 && !guestClientId && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-sm px-3 py-2 text-sm text-gray-400">
                      {individuals.length === 0 ? 'No uninvoiced individuals found for this company + period' : 'No matches'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Button onClick={handlePreview} disabled={previewing || !companyId || !periodFrom || !periodTo} variant="outline" className="w-full">
            {previewing ? 'Calculating…' : 'Preview Invoice'}
          </Button>

          {preview && (
            <div className="space-y-3">
              {/* Period trips */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-sm font-semibold">{preview.trip_count} trips in period</span>
                  <div className="text-sm text-gray-600 flex flex-wrap gap-4">
                    <span>{selectedItems.length} selected · Subtotal: <strong>{fmt(selTotals.sub)}</strong></span>
                    {selTotals.cgst > 0 && <span>GST: <strong>{fmt(selTotals.cgst + selTotals.sgst)}</strong></span>}
                    {selTotals.igst > 0 && <span>IGST: <strong>{fmt(selTotals.igst)}</strong></span>}
                    {selTotals.tds > 0 && <span>TDS: <strong>−{fmt(selTotals.tds)}</strong></span>}
                    <span className="font-bold text-gray-900">Total: {fmt(selTotals.grand)}</span>
                  </div>
                </div>
                {preview.line_items.length === 0
                  ? <div className="p-6 text-center text-sm text-gray-400">No uninvoiced trips found for this period</div>
                  : <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-xs">
                        {renderTableHead(preview.line_items)}
                        <tbody className="divide-y divide-gray-50">{renderTripRows(preview.line_items)}</tbody>
                      </table>
                    </div>}
              </div>

              {/* Missed trips from earlier periods */}
              {(preview.missed_line_items ?? []).length > 0 && (
                <div className="border border-amber-300 rounded-xl overflow-hidden">
                  <div className="bg-amber-50 px-4 py-2 flex items-center gap-2 flex-wrap">
                    <span className="text-amber-800 font-semibold text-sm">⚠️ {preview.missed_count} unbilled trip{preview.missed_count !== 1 ? 's' : ''} from earlier periods</span>
                    <span className="text-amber-600 text-xs">— not yet invoiced · check any you want to include</span>
                  </div>
                  <div className="overflow-x-auto max-h-[40vh]">
                    <table className="w-full text-xs">
                      {renderTableHead(preview.missed_line_items ?? [], true)}
                      <tbody className="divide-y divide-amber-50">{renderTripRows(preview.missed_line_items ?? [], true)}</tbody>
                    </table>
                  </div>
                </div>
              )}
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
          <Button onClick={handleSave} disabled={!preview || saving || selectedItems.length === 0}>
            {saving ? 'Saving…' : `Save as Draft${selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}`}
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
  const [generatePrefill, setGeneratePrefill] = useState<{ companyId: string; periodFrom: string; periodTo: string } | undefined>()

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', statusFilter],
    queryFn: () => fetch(`/api/billing/invoices${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`).then(r => r.json()),
  })
  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['companies-list'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
  })
  const { data: unbilledAlerts = [] } = useQuery<UnbilledAlert[]>({
    queryKey: ['unbilled-check'],
    queryFn: () => fetch('/api/billing/unbilled-check').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices
    const q = search.toLowerCase()
    return invoices.filter(i => (i.invoice_number ?? '').toLowerCase().includes(q) || i.company?.name?.toLowerCase().includes(q))
  }, [invoices, search])

  const totalOutstanding = useMemo(() => invoices.filter(i => i.status !== 'paid' && i.status !== 'cancelled' && i.status !== 'draft').reduce((s, i) => s + Number(i.balance_due), 0), [invoices])

  // Aged receivables: group unpaid invoices by company
  const agedReceivables = useMemo(() => {
    const today = new Date()
    const unpaid = invoices.filter(i => Number(i.balance_due) > 0 && i.status !== 'cancelled' && i.status !== 'draft')
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
            <Button size="sm" onClick={() => { setGeneratePrefill(undefined); setShowGenerate(true) }} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Generate Invoice
            </Button>
          </div>
        }
      />

      {/* Unbilled alert banner */}
      {unbilledAlerts.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-100 border-b border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="text-sm font-semibold text-amber-800">
              {unbilledAlerts.length} pending invoice{unbilledAlerts.length !== 1 ? 's' : ''} — completed trips not yet billed
            </span>
          </div>
          <div className="divide-y divide-amber-100">
            {unbilledAlerts.map((a, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 flex-wrap gap-2">
                <div>
                  <span className="font-semibold text-sm text-gray-900">{a.company_name}</span>
                  <span className="ml-2 text-xs text-amber-700 font-medium">{a.month}</span>
                  <span className="ml-2 text-xs text-gray-500">{a.trip_count} trip{a.trip_count !== 1 ? 's' : ''} unbilled</span>
                </div>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 h-7 text-xs"
                  onClick={() => {
                    setGeneratePrefill({ companyId: a.company_id, periodFrom: a.period_from, periodTo: a.period_to })
                    setShowGenerate(true)
                  }}>
                  <Plus className="w-3 h-3" />Generate Invoice
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {showGenerate && <GenerateModal
        companies={companies}
        prefill={generatePrefill}
        onClose={() => { setShowGenerate(false); setGeneratePrefill(undefined) }}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['invoices'] })
          qc.invalidateQueries({ queryKey: ['unbilled-check'] })
          setShowGenerate(false)
          setGeneratePrefill(undefined)
        }}
      />}
    </div>
  )
}
