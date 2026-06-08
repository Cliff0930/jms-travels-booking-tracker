'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { TripsheetEditPopup } from '@/components/billing/TripsheetEditPopup'
import { toast } from 'sonner'
import { Plus, Search, Download, TrendingUp, TrendingDown, Wallet, IndianRupee, Car, CalendarDays, Hash, Building2, ExternalLink } from 'lucide-react'
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
  booking_id: string; trip_sheet_id: string | null
  trip_date: string; booking_ref: string; tripsheet_number: string | null; company_name: string
  vehicle_type: string; trip_type: string; actual_kms: number; actual_hrs: number
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
  const { data: drivers = [] } = useQuery<{ id: string; name: string; vehicle_name: string; vehicle_number: string }[]>({
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
  const [editingTrip, setEditingTrip] = useState<TripPreview | null>(null)

  const selectedDriver = drivers.find(d => d.id === driverId)

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
        driver_id: preview.driver_id, period_from: preview.period_from, period_to: preview.period_to,
        total_trips: preview.total_trips, hire_earnings: preview.hire_earnings,
        bata_earnings: preview.bata_earnings, reimbursements: preview.reimbursements,
        salary_amount: preview.salary_amount, gross_earnings: preview.gross_earnings,
        advance_principal_deduction: preview.advance_principal_deduction,
        advance_interest_deduction: preview.advance_interest_deduction,
        other_deductions: 0, net_payable: preview.net_payable,
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
    <>
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-6xl max-h-[92vh] overflow-y-auto p-0">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-[#022448] to-[#1e3a5f] px-6 py-5 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">Driver Statement</p>
              <h2 className="text-white text-xl font-bold">
                {preview ? `${preview.driver_name} · ${preview.driver_vehicle}` : 'Generate Statement'}
              </h2>
              {preview && (
                <p className="text-blue-200 text-sm mt-0.5">
                  {fmtDate(preview.period_from)} — {fmtDate(preview.period_to)} · {preview.total_trips} trip{preview.total_trips !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            {preview && (
              <div className="text-right">
                <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest">Net Payable</p>
                <p className="text-white text-2xl font-black">{fmt(preview.net_payable)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Form ── */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" /> Driver *
                </Label>
                <select
                  value={driverId}
                  onChange={e => setDriverId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select driver…</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name} — {d.vehicle_name}</option>)}
                </select>
                {selectedDriver && (
                  <p className="text-[11px] text-gray-400">{selectedDriver.vehicle_name} · {selectedDriver.vehicle_number}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Period From *
                </Label>
                <Input type="date" value={periodFrom} onChange={e => setPeriodFrom(e.target.value)} className="h-9 border-gray-200 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Period To *
                </Label>
                <Input type="date" value={periodTo} onChange={e => setPeriodTo(e.target.value)} className="h-9 border-gray-200 rounded-lg" />
              </div>
            </div>
            <Button
              onClick={handlePreview}
              disabled={previewing || !driverId || !periodFrom || !periodTo}
              className="mt-4 w-full bg-[#022448] hover:bg-[#1e3a5f] rounded-lg font-semibold"
            >
              {previewing ? 'Calculating…' : '⚡ Calculate Earnings'}
            </Button>
          </div>

          {preview && (
            <div className="space-y-4">
              {/* ── Earnings summary ── */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-blue-500" />
                    <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">Hire</span>
                  </div>
                  <div className="text-lg font-bold text-blue-800">{fmt(preview.hire_earnings)}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Wallet className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">Bata</span>
                  </div>
                  <div className="text-lg font-bold text-indigo-800">{fmt(preview.bata_earnings)}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[11px] font-semibold text-purple-600 uppercase tracking-wide">Reimb</span>
                  </div>
                  <div className="text-lg font-bold text-purple-800">{fmt(preview.reimbursements)}</div>
                </div>
                <div className="bg-[#022448] border border-[#022448] rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-300" />
                    <span className="text-[11px] font-semibold text-blue-300 uppercase tracking-wide">Gross</span>
                  </div>
                  <div className="text-lg font-bold text-white">{fmt(preview.gross_earnings)}</div>
                </div>
              </div>

              {/* ── Deductions + net ── */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Outstanding</span>
                  </div>
                  <div className="text-lg font-bold text-gray-700">{fmt(preview.advance_outstanding)}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[11px] font-semibold text-red-500 uppercase tracking-wide">Interest {preview.interest_rate_pct}%</span>
                  </div>
                  <div className="text-lg font-bold text-red-700">{fmt(preview.advance_interest_deduction)}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-[11px] font-semibold text-red-500 uppercase tracking-wide">Principal</span>
                  </div>
                  <div className="text-lg font-bold text-red-700">-{fmt(preview.advance_principal_deduction)}</div>
                </div>
                <div className="bg-green-50 border-2 border-green-400 rounded-xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <IndianRupee className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-[11px] font-bold text-green-600 uppercase tracking-wide">Net Payable</span>
                  </div>
                  <div className="text-xl font-black text-green-700">{fmt(preview.net_payable)}</div>
                </div>
              </div>

              {/* ── Trip table ── */}
              {preview.trip_details.length > 0 ? (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="bg-[#022448] px-4 py-2.5 flex items-center justify-between">
                    <span className="text-white text-sm font-bold">{preview.total_trips} Trips</span>
                    <span className="text-blue-200 text-xs">{preview.driver_name} · {preview.driver_vehicle} · {preview.driver_vehicle_number}</span>
                    <span className="text-blue-300 text-[11px]">Click a booking ref to edit tripsheet</span>
                  </div>
                  <div className="overflow-x-auto max-h-80">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead className="bg-gray-800 border-b border-gray-700 sticky top-0">
                        <tr>
                          {[
                            { icon: CalendarDays, label: 'Date' },
                            { icon: Hash, label: 'Ref' },
                            { icon: Hash, label: 'TS#' },
                            { icon: Building2, label: 'Company' },
                            { icon: Car, label: 'KMs' },
                            { icon: IndianRupee, label: 'Driver Share' },
                            { icon: Wallet, label: 'Bata' },
                            { icon: TrendingUp, label: 'Reimb' },
                            { icon: IndianRupee, label: 'Total' },
                          ].map(({ label }) => (
                            <th key={label} className="px-3 py-2 text-left font-semibold text-gray-300 text-[11px] uppercase tracking-wide">{label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {preview.trip_details.map((t, i) => (
                          <tr key={i} className="hover:bg-blue-50 transition-colors">
                            <td className="px-3 py-2 text-gray-600">{t.trip_date}</td>
                            <td className="px-3 py-2">
                              {t.trip_sheet_id ? (
                                <button
                                  onClick={() => setEditingTrip(t)}
                                  className="font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 group"
                                >
                                  {t.booking_ref}
                                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                              ) : (
                                <span className="font-medium text-gray-700">{t.booking_ref}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-400 font-mono text-[11px]">{t.tripsheet_number ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-600 max-w-[110px] truncate">{t.company_name || '—'}</td>
                            <td className="px-3 py-2 text-gray-700">{t.actual_kms}</td>
                            <td className="px-3 py-2 font-bold text-blue-700">{fmt(t.hire_earnings)}</td>
                            <td className="px-3 py-2 text-indigo-600">{fmt(t.bata_earnings)}</td>
                            <td className="px-3 py-2 text-purple-600">{fmt(t.toll_amount + t.parking_amount + t.permit_amount)}</td>
                            <td className="px-3 py-2 font-bold text-gray-900">{fmt(t.trip_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-200">
                  <Car className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">No completed trips found</p>
                  <p className="text-gray-400 text-xs mt-1">for this driver in the selected period</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <Button variant="outline" onClick={onClose} className="rounded-lg">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!preview || saving || preview.total_trips === 0}
            className="bg-[#022448] hover:bg-[#1e3a5f] rounded-lg px-8 font-semibold"
          >
            {saving ? 'Saving…' : '💾 Save as Draft'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* TripsheetEditPopup — opens when booking ref clicked */}
    {editingTrip && editingTrip.trip_sheet_id && (
      <TripsheetEditPopup
        bookingId={editingTrip.booking_id}
        tripSheetId={editingTrip.trip_sheet_id}
        bookingRef={editingTrip.booking_ref}
        tripType={editingTrip.trip_type}
        onClose={() => setEditingTrip(null)}
        onSaved={() => {
          setEditingTrip(null)
          // Re-fetch preview to reflect saved changes
          void handlePreview()
        }}
      />
    )}
    </>
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
