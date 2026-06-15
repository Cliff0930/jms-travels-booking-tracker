'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, CheckCircle2, Circle, ChevronDown, ChevronUp, CalendarDays, Download, RotateCcw, Plus } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import Link from 'next/link'
import type { ReimbursementSheet } from '@/types'
import { TripsheetEditPopup } from '@/components/billing/TripsheetEditPopup'

interface DriverSummary {
  id: string
  name: string
}

export default function ReimbursementsPage() {
  const [tab, setTab] = useState<'pending' | 'settled'>('pending')
  const [driverId, setDriverId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const qc = useQueryClient()

  const { data: sheets = [], isLoading, refetch } = useQuery<ReimbursementSheet[]>({
    queryKey: ['reimbursements', tab, driverId, search, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ status: tab })
      if (driverId !== 'all') params.set('driver_id', driverId)
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      return fetch(`/api/reimbursements?${params}`).then(r => r.json())
    },
  })

  // Build driver list from loaded sheets for the dropdown
  const drivers = useMemo<DriverSummary[]>(() => {
    const seen = new Map<string, string>()
    for (const s of sheets) {
      if (s.driver_id && s.driver_name && !seen.has(s.driver_id)) {
        seen.set(s.driver_id, s.driver_name)
      }
    }
    // Also fetch from all pending to populate dropdown even when filtering
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [sheets])

  const { data: allDriverSheets = [] } = useQuery<ReimbursementSheet[]>({
    queryKey: ['reimbursements-all-drivers'],
    queryFn: () => fetch('/api/reimbursements?status=all').then(r => r.json()),
  })

  const allDrivers = useMemo<DriverSummary[]>(() => {
    const seen = new Map<string, string>()
    for (const s of allDriverSheets) {
      if (s.driver_id && s.driver_name && !seen.has(s.driver_id)) seen.set(s.driver_id, s.driver_name)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allDriverSheets])

  const qKey = ['reimbursements', tab, driverId, search, dateFrom, dateTo] as const

  async function patchSheet(sheetId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/reimbursements/${sheetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error()
    return res.json() as Promise<Partial<ReimbursementSheet>>
  }

  async function toggleFlag(sheetId: string, field: string, value: boolean) {
    const prev = qc.getQueryData<ReimbursementSheet[]>(qKey)
    qc.setQueryData<ReimbursementSheet[]>(qKey, old =>
      old?.map(s => s.sheet_id === sheetId ? { ...s, [field]: value } : s) ?? []
    )
    try {
      const data = await patchSheet(sheetId, { [field]: value })
      const prevSheet = prev?.find(s => s.sheet_id === sheetId)
      // Invalidate (card moves tabs) when tripsheet_doc_received changes
      if (data.tripsheet_doc_received !== prevSheet?.tripsheet_doc_received) {
        qc.invalidateQueries({ queryKey: ['reimbursements'] })
      } else {
        qc.setQueryData<ReimbursementSheet[]>(qKey, old =>
          old?.map(s => s.sheet_id === sheetId ? { ...s, ...data } : s) ?? []
        )
      }
    } catch {
      qc.setQueryData(qKey, prev)
      toast.error('Failed to update')
    }
  }

  async function rejectItem(sheetId: string, itemKey: string, current: string | null) {
    const rejSet = new Set((current ?? '').split(',').filter(Boolean))
    rejSet.has(itemKey) ? rejSet.delete(itemKey) : rejSet.add(itemKey)
    const newVal = Array.from(rejSet).join(',') || null
    const prev = qc.getQueryData<ReimbursementSheet[]>(qKey)
    qc.setQueryData<ReimbursementSheet[]>(qKey, old =>
      old?.map(s => s.sheet_id === sheetId ? { ...s, rejected_items: newVal } : s) ?? []
    )
    try {
      const data = await patchSheet(sheetId, { rejected_items: newVal })
      const prevSheet = prev?.find(s => s.sheet_id === sheetId)
      if (data.tripsheet_doc_received !== prevSheet?.tripsheet_doc_received) {
        qc.invalidateQueries({ queryKey: ['reimbursements'] })
      }
    } catch {
      qc.setQueryData(qKey, prev)
      toast.error('Failed to update')
    }
  }

  async function settleAll(sheetId: string, sheet: ReimbursementSheet) {
    const rejected = new Set((sheet.rejected_items ?? '').split(',').filter(Boolean))
    const update: Record<string, boolean> = { tripsheet_doc_received: true }
    if (sheet.toll_amount != null && !rejected.has('toll')) { update.toll_received = true; update.toll_paid = true }
    if (sheet.parking_amount != null && !rejected.has('parking')) { update.parking_received = true; update.parking_paid = true }
    if (sheet.permit_amount != null && !rejected.has('permit')) { update.permit_received = true; update.permit_paid = true }
    if (sheet.bata_driver != null && !rejected.has('bata')) { update.bata_received = true; update.bata_paid = true }
    const prev = qc.getQueryData<ReimbursementSheet[]>(qKey)
    qc.setQueryData<ReimbursementSheet[]>(qKey, old =>
      old?.map(s => s.sheet_id === sheetId ? { ...s, ...update } : s) ?? []
    )
    try {
      await patchSheet(sheetId, update)
      toast.success('Trip fully settled')
      qc.invalidateQueries({ queryKey: ['reimbursements'] })
    } catch {
      qc.setQueryData(qKey, prev)
      toast.error('Failed to settle')
    }
  }

  async function revokeSettlement(sheetId: string) {
    try {
      await patchSheet(sheetId, { revoke: true })
      toast.success('Settlement revoked — moved back to pending')
      qc.invalidateQueries({ queryKey: ['reimbursements'] })
    } catch {
      toast.error('Failed to revoke')
    }
  }

  function exportExcel() {
    const rows = sheets.map(s => ({
      'Booking Ref': s.booking_ref,
      'Tripsheet #': s.tripsheet_number ?? '',
      'Traveller': s.guest_name || s.requested_by || '',
      'Phone': s.guest_phone || s.client_phone || '',
      'Driver': s.driver_name ?? '',
      'Vehicle': s.driver_vehicle_name ?? '',
      'Company': s.company_name ?? '',
      'Pickup Date': s.pickup_date ? new Date(s.pickup_date).toLocaleDateString('en-IN') : '',
      'Toll (₹)': s.toll_amount ?? '',
      'Parking (₹)': s.parking_amount ?? '',
      'Permit (₹)': s.permit_amount ?? '',
      'Bata Count': s.bata_driver ?? '',
      'Bata Rate (₹)': s.bata_rate ?? '',
      'Bata Amount (₹)': s.bata_amount ?? '',
      'Total (₹)': (s.toll_amount ?? 0) + (s.parking_amount ?? 0) + (s.permit_amount ?? 0) + (s.bata_amount ?? 0),
      'Settled On': s.reimbursed_at ? new Date(s.reimbursed_at).toLocaleDateString('en-IN') : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Reimbursements')
    const label = tab === 'settled' ? 'settled' : 'pending'
    XLSX.writeFile(wb, `reimbursements-${label}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // Compute totals
  const outstanding = sheets.filter(s => !s.reimbursed_at).reduce((sum, s) => {
    return sum +
      (s.toll_amount ?? 0) +
      (s.parking_amount ?? 0) +
      (s.permit_amount ?? 0) +
      (s.bata_amount ?? 0)
  }, 0)

  return (
    <div>
      <PageHeader
        title="Reimbursements"
        description="Track document collection and cash payments to drivers"
      />

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Tab */}
        <div className="flex rounded-lg border border-[#C3C5D7] overflow-hidden text-sm">
          {(['pending', 'settled'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 font-semibold capitalize transition-colors ${tab === t ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#6B7280] hover:bg-[#F3F3FE]'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Driver filter */}
        <Select value={driverId} onValueChange={v => v && setDriverId(v)}>
          <SelectTrigger className="border-[#C3C5D7] h-9 text-sm w-48">
            <SelectValue placeholder="All drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {allDrivers.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ref, driver, vehicle…"
            className="pl-9 border-[#C3C5D7] h-9 text-sm"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 shrink-0">
          <CalendarDays className="w-3.5 h-3.5 text-[#737686]" />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border-[#C3C5D7] h-9 text-sm w-36"
          />
          <span className="text-xs text-[#737686]">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border-[#C3C5D7] h-9 text-sm w-36"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-[#737686] hover:text-[#374151] px-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Outstanding total / Export / Offline Trip */}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/bookings/offline-trip">
            <Button size="sm" className="h-9 text-xs gap-1.5 bg-[#7E3AF2] hover:bg-[#6C2BD9]">
              <Plus className="w-3.5 h-3.5" /> Offline Trip
            </Button>
          </Link>
          {tab === 'pending' && outstanding > 0 && (
            <div className="text-sm font-bold text-[#DC2626] bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              Outstanding: ₹{outstanding.toFixed(0)}
            </div>
          )}
          {sheets.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 text-xs gap-1.5 border-[#C3C5D7]"
              onClick={exportExcel}
            >
              <Download className="w-3.5 h-3.5" /> Export Excel
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading…</div>
      ) : sheets.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[#737686] text-sm">
            {tab === 'pending' ? 'No pending tripsheets — all documents received' : 'No settled tripsheets yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map(sheet => (
            <TripCard
              key={sheet.sheet_id}
              sheet={sheet}
              settled={tab === 'settled'}
              onToggle={toggleFlag}
              onSettleAll={settleAll}
              onRevoke={revokeSettlement}
              onReject={rejectItem}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TripCard({
  sheet,
  settled,
  onToggle,
  onSettleAll,
  onRevoke,
  onReject,
}: {
  sheet: ReimbursementSheet
  settled: boolean
  onToggle: (sheetId: string, field: string, value: boolean) => void
  onSettleAll: (sheetId: string, sheet: ReimbursementSheet) => void
  onRevoke: (sheetId: string) => void
  onReject: (sheetId: string, itemKey: string, current: string | null) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [showTripsheet, setShowTripsheet] = useState(false)
  const qc = useQueryClient()
  const sheetId = sheet.sheet_id ?? ''
  const rejectedSet = new Set((sheet.rejected_items ?? '').split(',').filter(Boolean))

  const totalOwed =
    (!rejectedSet.has('toll') ? (sheet.toll_amount ?? 0) : 0) +
    (!rejectedSet.has('parking') ? (sheet.parking_amount ?? 0) : 0) +
    (!rejectedSet.has('permit') ? (sheet.permit_amount ?? 0) : 0) +
    (!rejectedSet.has('bata') ? (sheet.bata_amount ?? 0) : 0)
  // Settled = tripsheet document received (payment status is separate)
  const allSettled = !!sheet.tripsheet_doc_received

  return (
    <div className={`bg-white rounded-xl border ${allSettled ? 'border-[#A7F3D0]' : 'border-[#C3C5D7]'} shadow-sm overflow-hidden`}>
      {/* Card Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${allSettled ? 'bg-[#ECFDF5]' : 'bg-[#F9FAFB]'}`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {allSettled
            ? <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            : <Circle className="w-4 h-4 text-[#9CA3AF] shrink-0" />
          }
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowTripsheet(true) }}
                className="text-sm font-bold text-[#1A56DB] hover:underline underline-offset-2 cursor-pointer"
              >
                {sheet.booking_ref}
              </button>
              {sheet.tripsheet_number && <span className="text-xs font-mono bg-[#F3F4F6] text-[#374151] px-1.5 py-0.5 rounded">TS#{sheet.tripsheet_number}</span>}
              {sheet.driver_name && <span className="text-sm font-semibold text-[#191B23]">{sheet.driver_name}</span>}
              {sheet.driver_vehicle_name && <span className="text-xs text-[#737686]">· {sheet.driver_vehicle_name}</span>}
              {sheet.driver_vehicle_number && <span className="text-xs font-mono bg-[#F3F4F6] text-[#374151] px-1.5 py-0.5 rounded">{sheet.driver_vehicle_number}</span>}
              {sheet.trip_type && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                  sheet.trip_type === 'local' ? 'bg-blue-100 text-blue-700'
                  : sheet.trip_type === 'outstation' ? 'bg-orange-100 text-orange-700'
                  : 'bg-purple-100 text-purple-700'
                }`}>{sheet.trip_type}</span>
              )}
              {sheet.booking_status && sheet.booking_status !== 'completed' && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                  sheet.booking_status === 'arrived' ? 'bg-yellow-100 text-yellow-700'
                  : sheet.booking_status === 'driver_assigned' ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-gray-100 text-gray-600'
                }`}>{sheet.booking_status.replace('_', ' ')}</span>
              )}
              {!sheet.has_tripsheet && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">No tripsheet</span>
              )}
              {sheet.company_name && <span className="text-xs bg-[#EEF2FF] text-[#4F46E5] px-2 py-0.5 rounded-full font-medium">{sheet.company_name}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {sheet.pickup_date && <span className="text-xs text-[#737686]">{new Date(sheet.pickup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>}
              {(sheet.guest_name || sheet.requested_by) && (
                <span className="text-xs text-[#374151] font-medium">{sheet.guest_name || sheet.requested_by}</span>
              )}
              {(sheet.guest_phone || sheet.client_phone) && (
                <span className="text-xs text-[#737686]">{sheet.guest_phone || sheet.client_phone}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {totalOwed > 0 && (
            <span className={`text-sm font-bold ${allSettled ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              {allSettled ? '✓' : ''} ₹{totalOwed.toFixed(0)}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-[#737686]" /> : <ChevronDown className="w-4 h-4 text-[#737686]" />}
        </div>
      </div>

      {showTripsheet && (
        <TripsheetEditPopup
          bookingId={sheet.booking_id}
          tripSheetId={sheetId}
          bookingRef={sheet.booking_ref}
          tripType={sheet.trip_type}
          onClose={() => setShowTripsheet(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['reimbursements'] })}
        />
      )}

      {/* Card Body */}
      {expanded && !sheet.has_tripsheet && (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-[#9CA3AF]">No tripsheet submitted yet — click the booking ref above to add one.</p>
        </div>
      )}

      {expanded && sheet.has_tripsheet && (
        <div className="px-4 py-3 space-y-0.5">

          {/* Time info for bata verification */}
          {(() => {
            const fmt = (t: string | null | undefined) => {
              if (!t) return '—'
              // ISO timestamp → HH:MM IST
              if (t.includes('T') || t.includes('Z')) {
                return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
              }
              return t
            }
            const hasAny = sheet.manual_opening_time || sheet.manual_closing_time || sheet.opening_time || sheet.closing_time
            if (!hasAny) return null
            const isOutstation = sheet.trip_type === 'outstation'
            const dateLabel = isOutstation && sheet.leg_date
              ? new Date(sheet.leg_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
              : sheet.pickup_date
                ? new Date(sheet.pickup_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : null
            return (
              <div className="bg-[#F8FAFF] border border-[#E0E7FF] rounded-lg px-3 py-2 mb-2 text-xs">
                {dateLabel && <span className="font-semibold text-[#4F46E5] mr-2">{dateLabel}</span>}
                <span className="text-[#374151]">
                  <span className="text-[#737686]">Driver: </span>
                  <span className="font-mono font-medium">{fmt(sheet.manual_opening_time)}</span>
                  <span className="text-[#9CA3AF] mx-1">→</span>
                  <span className="font-mono font-medium">{fmt(sheet.manual_closing_time)}</span>
                </span>
                {(sheet.opening_time || sheet.closing_time) && (
                  <span className="ml-3 text-[#374151]">
                    <span className="text-[#737686]">GPS: </span>
                    <span className="font-mono">{fmt(sheet.opening_time)}</span>
                    <span className="text-[#9CA3AF] mx-1">→</span>
                    <span className="font-mono">{fmt(sheet.closing_time)}</span>
                  </span>
                )}
                {sheet.bata_driver != null && sheet.bata_driver > 0
                  ? <span className="ml-3 text-[#059669] font-semibold">✓ {sheet.bata_driver} bata</span>
                  : <span className="ml-3 text-[#9CA3AF]">no bata</span>
                }
              </div>
            )
          })()}

          {/* Tripsheet doc row — always shown */}
          <ItemRow
            label="Tripsheet Document"
            receivedField="tripsheet_doc_received"
            received={sheet.tripsheet_doc_received}
            hasPaid={false}
            settled={settled}
            rejected={false}
            onToggle={(field, val) => onToggle(sheetId, field, val)}
            onReject={() => {}}
          />

          {sheet.toll_amount != null && (
            <ItemRow
              label="Toll"
              amount={sheet.toll_amount}
              receivedField="toll_received"
              paidField="toll_paid"
              received={sheet.toll_received}
              paid={sheet.toll_paid}
              hasPaid
              settled={settled}
              rejected={rejectedSet.has('toll')}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onReject={() => onReject(sheetId, 'toll', sheet.rejected_items)}
            />
          )}

          {sheet.parking_amount != null && (
            <ItemRow
              label="Parking"
              amount={sheet.parking_amount}
              receivedField="parking_received"
              paidField="parking_paid"
              received={sheet.parking_received}
              paid={sheet.parking_paid}
              hasPaid
              settled={settled}
              rejected={rejectedSet.has('parking')}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onReject={() => onReject(sheetId, 'parking', sheet.rejected_items)}
            />
          )}

          {sheet.permit_amount != null && (
            <ItemRow
              label="Permit"
              amount={sheet.permit_amount}
              receivedField="permit_received"
              paidField="permit_paid"
              received={sheet.permit_received}
              paid={sheet.permit_paid}
              hasPaid
              settled={settled}
              rejected={rejectedSet.has('permit')}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onReject={() => onReject(sheetId, 'permit', sheet.rejected_items)}
            />
          )}

          {sheet.bata_driver != null && (
            <ItemRow
              label={`Bata (${sheet.bata_driver} × ${sheet.bata_rate != null ? `₹${sheet.bata_rate}` : 'rate?'})`}
              amount={sheet.bata_amount ?? undefined}
              receivedField="bata_received"
              paidField="bata_paid"
              received={sheet.bata_received}
              paid={sheet.bata_paid}
              hasPaid
              settled={settled}
              rejected={rejectedSet.has('bata')}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onReject={() => onReject(sheetId, 'bata', sheet.rejected_items)}
            />
          )}

          {/* Footer */}
          {!settled && !allSettled && (
            <div className="flex justify-end pt-3 border-t border-[#F3F4F6] mt-2">
              <Button
                size="sm"
                className="bg-[#059669] hover:bg-[#047857] rounded-sm gap-1.5 h-8 text-xs"
                onClick={() => onSettleAll(sheetId, sheet)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Settle All
              </Button>
            </div>
          )}

          {allSettled && (
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-[#F3F4F6]">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-[#FCA5A5] text-[#DC2626] hover:bg-red-50"
                onClick={() => onRevoke(sheetId)}
              >
                <RotateCcw className="w-3 h-3" /> Revoke
              </Button>
              <p className="text-xs font-medium">
                {sheet.reimbursed_at
                  ? <span className="text-[#059669]">Settled &amp; paid · {new Date(sheet.reimbursed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                  : <span className="text-[#1A56DB]">Doc received · payment pending</span>
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ItemRow({
  label, amount, receivedField, paidField,
  received, paid, hasPaid, settled, rejected, onToggle, onReject,
}: {
  label: string
  amount?: number
  receivedField: string
  paidField?: string
  received: boolean
  paid?: boolean
  hasPaid: boolean
  settled: boolean
  rejected: boolean
  onToggle: (field: string, value: boolean) => void
  onReject: () => void
}) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0 ${rejected ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm text-[#374151] font-medium ${rejected ? 'line-through' : ''}`}>{label}</span>
        {amount != null && <span className={`text-sm font-bold text-[#191B23] ${rejected ? 'line-through' : ''}`}>₹{amount.toFixed(0)}</span>}
        {rejected && <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">Rejected</span>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!rejected && (
          <>
            <Toggle label="Received" checked={received} disabled={settled} onChange={val => onToggle(receivedField, val)} color="blue" />
            {hasPaid && paidField && (
              <Toggle label="Paid" checked={!!paid} disabled={settled || !received} onChange={val => onToggle(paidField, val)} color="green" />
            )}
          </>
        )}
        {hasPaid && !settled && (
          <button
            onClick={onReject}
            className={`text-[11px] px-2 py-1 rounded border font-semibold transition-colors ${
              rejected
                ? 'border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100'
                : 'border-[#FCA5A5] text-[#DC2626] hover:bg-red-50'
            }`}
          >
            {rejected ? '↩ Restore' : '✕ Reject'}
          </button>
        )}
      </div>
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
  color,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (val: boolean) => void
  color: 'blue' | 'green'
}) {
  const activeClass = color === 'blue'
    ? 'bg-[#1A56DB] border-[#1A56DB] text-white'
    : 'bg-[#059669] border-[#059669] text-white'

  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
        checked ? activeClass : 'bg-white border-[#C3C5D7] text-[#6B7280]'
      } ${disabled && !checked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
    >
      {checked ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
      {label}
    </button>
  )
}
