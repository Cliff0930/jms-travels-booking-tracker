'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Search, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'

interface Settlement {
  id: string; driver_id: string; period_from: string; period_to: string
  total_trips: number; gross_earnings: number; advance_principal_deduction: number
  advance_interest_deduction: number; net_payable: number
  status: string; paid_at: string | null; created_at: string
  driver?: { id: string; name: string; vehicle_name: string; vehicle_number: string }
}

interface TripPreview {
  trip_date: string; booking_ref: string; company_name: string
  vehicle_type: string; actual_kms: number; actual_hrs: number
  client_hire_charges: number; commission_percent: number; hire_earnings: number
  bata_count: number; driver_bata_rate: number; bata_earnings: number
  toll_amount: number; parking_amount: number; permit_amount: number; trip_total: number
}

interface GeneratePreview {
  driver_id: string; driver_name: string; driver_vehicle: string; driver_vehicle_number: string
  period_from: string; period_to: string; total_trips: number
  trip_details: TripPreview[]; hire_earnings: number; bata_earnings: number
  reimbursements: number; salary_amount: number; gross_earnings: number
  advance_outstanding: number; advance_principal_deduction: number
  advance_interest_deduction: number; interest_rate_pct: number; net_payable: number
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  paid: 'bg-green-50 text-green-700',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '₹0'
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function GenerateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const router = useRouter()
  const { data: drivers = [] } = useQuery<{ id: string; name: string; vehicle_name: string }[]>({
    queryKey: ['drivers-active'],
    queryFn: () => fetch('/api/drivers').then(r => r.json()),
  })
  const [driverId, setDriverId] = useState('')
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [periodTo, setPeriodTo] = useState(() => {
    const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10)
  })
  const [preview, setPreview] = useState<GeneratePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handlePreview() {
    if (!driverId || !periodFrom || !periodTo) { toast.error('Fill all fields'); return }
    setPreviewing(true)
    const res = await fetch('/api/billing/driver-settlements/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: driverId, period_from: periodFrom, period_to: periodTo }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to generate'); setPreviewing(false); return }
    setPreview(data)
    setPreviewing(false)
  }

  async function handleSave() {
    if (!preview) return
    setSaving(true)
    const res = await fetch('/api/billing/driver-settlements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driver_id: preview.driver_id,
        period_from: preview.period_from,
        period_to: preview.period_to,
        total_trips: preview.total_trips,
        hire_earnings: preview.hire_earnings,
        bata_earnings: preview.bata_earnings,
        reimbursements: preview.reimbursements,
        salary_amount: preview.salary_amount,
        gross_earnings: preview.gross_earnings,
        advance_principal_deduction: preview.advance_principal_deduction,
        advance_interest_deduction: preview.advance_interest_deduction,
        other_deductions: 0,
        net_payable: preview.net_payable,
        trip_details: preview.trip_details,
      }),
    })
    if (res.ok) {
      const settlement = await res.json()
      toast.success('Statement saved — review and mark as paid')
      onSaved()
      router.push(`/billing/driver-settlements/${settlement.id}`)
    } else {
      toast.error('Failed to save')
    }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Generate Driver Statement</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Driver *</Label>
              <select
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select driver…</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.vehicle_name}</option>)}
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
          </div>

          <Button onClick={handlePreview} disabled={previewing || !driverId || !periodFrom || !periodTo} variant="outline" className="w-full">
            {previewing ? 'Calculating…' : 'Calculate Earnings'}
          </Button>

          {preview && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Hire Earnings', value: fmt(preview.hire_earnings) },
                  { label: 'Bata Earnings', value: fmt(preview.bata_earnings) },
                  { label: 'Reimbursements', value: fmt(preview.reimbursements) },
                  { label: 'Gross Earnings', value: fmt(preview.gross_earnings), bold: true },
                ].map(c => (
                  <div key={c.label} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                    <div className={cn('text-sm', c.bold ? 'font-bold text-blue-700 text-base' : 'font-semibold text-gray-900')}>{c.value}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Advance Outstanding', value: fmt(preview.advance_outstanding) },
                  { label: `Interest (${preview.interest_rate_pct}%/mo)`, value: fmt(preview.advance_interest_deduction) },
                  { label: 'Principal Deduction', value: fmt(preview.advance_principal_deduction) },
                  { label: 'NET PAYABLE', value: fmt(preview.net_payable), bold: true },
                ].map(c => (
                  <div key={c.label} className={cn('border rounded-lg p-3', c.bold ? 'border-green-300 bg-green-50' : 'border-gray-200')}>
                    <div className="text-xs text-gray-500 mb-1">{c.label}</div>
                    <div className={cn('text-sm', c.bold ? 'font-bold text-green-700 text-base' : 'font-semibold text-gray-900')}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Trip table */}
              {preview.trip_details.length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">{preview.total_trips} trips</span>
                    <span className="text-xs text-gray-500">{preview.driver_name} · {preview.driver_vehicle} · {preview.driver_vehicle_number}</span>
                  </div>
                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {['Date', 'Ref', 'Company', 'KMs', 'Hire Chg', `Comm ${preview.trip_details[0]?.commission_percent}%`, 'Driver Share', 'Bata', 'Reimb', 'Total'].map(h => (
                            <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {preview.trip_details.map((t, i) => (
                          <tr key={i} className={i % 2 === 1 ? 'bg-gray-50' : ''}>
                            <td className="px-2 py-1.5 whitespace-nowrap">{t.trip_date}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap font-medium">{t.booking_ref}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap max-w-[100px] truncate">{t.company_name}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{t.actual_kms}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmt(t.client_hire_charges)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap text-red-600">-{fmt(t.client_hire_charges - t.hire_earnings)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap font-medium text-blue-700">{fmt(t.hire_earnings)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmt(t.bata_earnings)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmt(t.toll_amount + t.parking_amount + t.permit_amount)}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap font-semibold">{fmt(t.trip_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {preview.total_trips === 0 && (
                <div className="p-6 text-center text-gray-400 text-sm border border-gray-200 rounded-xl">
                  No completed trips found for this driver in the selected period.
                </div>
              )}
            </div>
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

export default function DriverSettlementsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)

  const { data: settlements = [], isLoading } = useQuery<Settlement[]>({
    queryKey: ['driver-settlements', statusFilter],
    queryFn: () => fetch(`/api/billing/driver-settlements${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`).then(r => r.json()),
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return settlements
    const q = search.toLowerCase()
    return settlements.filter(s => s.driver?.name?.toLowerCase().includes(q) || s.driver?.vehicle_name?.toLowerCase().includes(q))
  }, [settlements, search])

  const totalOutstanding = useMemo(() =>
    settlements.filter(s => s.status === 'draft').reduce((sum, s) => sum + Number(s.net_payable), 0),
    [settlements]
  )

  function exportExcel() {
    const rows = filtered.map(s => ({
      'Driver': s.driver?.name ?? '',
      'Vehicle': s.driver?.vehicle_name ?? '',
      'Period From': s.period_from,
      'Period To': s.period_to,
      'Trips': s.total_trips,
      'Gross Earnings (₹)': Number(s.gross_earnings),
      'Advance Deduction (₹)': Number(s.advance_principal_deduction),
      'Interest (₹)': Number(s.advance_interest_deduction),
      'Net Payable (₹)': Number(s.net_payable),
      'Status': s.status,
      'Paid On': s.paid_at ? fmtDate(s.paid_at) : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Driver Statements')
    XLSX.writeFile(wb, `driver-statements-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Driver Statements"
        description="Monthly settlement statements for all drivers"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportExcel} className="gap-1.5">
              <Download className="w-3.5 h-3.5" />Excel
            </Button>
            <Button size="sm" onClick={() => setShowGenerate(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Generate Statement
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
          {['all', 'draft', 'paid'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-2 font-semibold capitalize transition-colors',
                statusFilter === s ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
            >{s}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search driver…" className="pl-9 h-9 text-sm" />
        </div>
        {totalOutstanding > 0 && (
          <div className="ml-auto text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 font-semibold">
            Unpaid: ₹{totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No statements found. Click "Generate Statement" to create one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Driver', 'Vehicle', 'Period', 'Trips', 'Gross', 'Deductions', 'Net Payable', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/billing/driver-settlements/${s.id}`)}>
                  <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{s.driver?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.driver?.vehicle_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(s.period_from)} — {fmtDate(s.period_to)}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{s.total_trips}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{fmt(s.gross_earnings)}</td>
                  <td className="px-4 py-3 text-red-600 whitespace-nowrap">{fmt(Number(s.advance_principal_deduction) + Number(s.advance_interest_deduction))}</td>
                  <td className="px-4 py-3 font-bold text-green-700 whitespace-nowrap">{fmt(s.net_payable)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', STATUS_COLORS[s.status] ?? 'bg-gray-100 text-gray-500')}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{s.paid_at ? fmtDate(s.paid_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showGenerate && (
        <GenerateModal
          onClose={() => setShowGenerate(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['driver-settlements'] }); setShowGenerate(false) }}
        />
      )}
    </div>
  )
}
