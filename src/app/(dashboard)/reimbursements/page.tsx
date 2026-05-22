'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, CheckCircle2, Circle, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import type { ReimbursementSheet } from '@/types'

interface DriverSummary {
  id: string
  name: string
}

export default function ReimbursementsPage() {
  const [tab, setTab] = useState<'pending' | 'settled'>('pending')
  const [driverId, setDriverId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const qc = useQueryClient()

  const { data: sheets = [], isLoading, refetch } = useQuery<ReimbursementSheet[]>({
    queryKey: ['reimbursements', tab, driverId, search],
    queryFn: () => {
      const params = new URLSearchParams({ status: tab })
      if (driverId !== 'all') params.set('driver_id', driverId)
      if (search.trim()) params.set('search', search.trim())
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
    queryFn: () => fetch('/api/reimbursements?status=pending').then(r => r.json()),
  })

  const allDrivers = useMemo<DriverSummary[]>(() => {
    const seen = new Map<string, string>()
    for (const s of allDriverSheets) {
      if (s.driver_id && s.driver_name && !seen.has(s.driver_id)) seen.set(s.driver_id, s.driver_name)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allDriverSheets])

  async function toggleFlag(sheetId: string, field: string, value: boolean) {
    try {
      const res = await fetch(`/api/reimbursements/${sheetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) throw new Error()
      qc.invalidateQueries({ queryKey: ['reimbursements'] })
      qc.invalidateQueries({ queryKey: ['reimbursements-all-drivers'] })
    } catch {
      toast.error('Failed to update')
    }
  }

  async function settleAll(sheetId: string, sheet: ReimbursementSheet) {
    const update: Record<string, boolean> = {
      tripsheet_doc_received: true,
    }
    if (sheet.toll_amount != null) { update.toll_received = true; update.toll_paid = true }
    if (sheet.parking_amount != null) { update.parking_received = true; update.parking_paid = true }
    if (sheet.permit_amount != null) { update.permit_received = true; update.permit_paid = true }
    if (sheet.bata_driver != null) { update.bata_received = true; update.bata_paid = true }
    try {
      const res = await fetch(`/api/reimbursements/${sheetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      if (!res.ok) throw new Error()
      toast.success('Trip fully settled')
      qc.invalidateQueries({ queryKey: ['reimbursements'] })
      qc.invalidateQueries({ queryKey: ['reimbursements-all-drivers'] })
    } catch {
      toast.error('Failed to settle')
    }
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
            placeholder="Search booking ref or driver…"
            className="pl-9 border-[#C3C5D7] h-9 text-sm"
          />
        </div>

        {/* Outstanding total */}
        {tab === 'pending' && outstanding > 0 && (
          <div className="ml-auto text-sm font-bold text-[#DC2626] bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            Outstanding: ₹{outstanding.toFixed(0)}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading…</div>
      ) : sheets.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[#737686] text-sm">
            {tab === 'pending' ? 'No pending reimbursements' : 'No settled reimbursements yet'}
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
}: {
  sheet: ReimbursementSheet
  settled: boolean
  onToggle: (sheetId: string, field: string, value: boolean) => void
  onSettleAll: (sheetId: string, sheet: ReimbursementSheet) => void
}) {
  const [expanded, setExpanded] = useState(true)

  const totalOwed = (sheet.toll_amount ?? 0) + (sheet.parking_amount ?? 0) + (sheet.permit_amount ?? 0) + (sheet.bata_amount ?? 0)
  const totalPaid = (sheet.toll_paid && sheet.toll_amount ? sheet.toll_amount : 0) +
    (sheet.parking_paid && sheet.parking_amount ? sheet.parking_amount : 0) +
    (sheet.permit_paid && sheet.permit_amount ? sheet.permit_amount : 0) +
    (sheet.bata_paid && sheet.bata_amount != null ? sheet.bata_amount : 0)

  const allSettled = !!sheet.reimbursed_at

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
              <span className="text-sm font-bold text-[#1A56DB]">{sheet.booking_ref}</span>
              {sheet.tripsheet_number && <span className="text-xs font-mono bg-[#F3F4F6] text-[#374151] px-1.5 py-0.5 rounded">TS#{sheet.tripsheet_number}</span>}
              {sheet.driver_name && <span className="text-sm font-semibold text-[#191B23]">{sheet.driver_name}</span>}
              {sheet.driver_vehicle_name && <span className="text-xs text-[#737686]">· {sheet.driver_vehicle_name}</span>}
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

      {/* Card Body */}
      {expanded && (
        <div className="px-4 py-3 space-y-0.5">
          {/* Tripsheet doc row — always shown */}
          <ItemRow
            label="Tripsheet Document"
            receivedField="tripsheet_doc_received"
            received={sheet.tripsheet_doc_received}
            hasPaid={false}
            settled={settled}
            onToggle={(field, val) => onToggle(sheet.sheet_id, field, val)}
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
              onToggle={(field, val) => onToggle(sheet.sheet_id, field, val)}
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
              onToggle={(field, val) => onToggle(sheet.sheet_id, field, val)}
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
              onToggle={(field, val) => onToggle(sheet.sheet_id, field, val)}
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
              onToggle={(field, val) => onToggle(sheet.sheet_id, field, val)}
            />
          )}

          {/* Footer */}
          {!settled && !allSettled && (
            <div className="flex justify-end pt-3 border-t border-[#F3F4F6] mt-2">
              <Button
                size="sm"
                className="bg-[#059669] hover:bg-[#047857] rounded-sm gap-1.5 h-8 text-xs"
                onClick={() => onSettleAll(sheet.sheet_id, sheet)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Settle All
              </Button>
            </div>
          )}

          {allSettled && sheet.reimbursed_at && (
            <p className="text-xs text-[#059669] text-right pt-2 font-medium">
              Settled on {new Date(sheet.reimbursed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ItemRow({
  label,
  amount,
  receivedField,
  paidField,
  received,
  paid,
  hasPaid,
  settled,
  onToggle,
}: {
  label: string
  amount?: number
  receivedField: string
  paidField?: string
  received: boolean
  paid?: boolean
  hasPaid: boolean
  settled: boolean
  onToggle: (field: string, value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6] last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-[#374151] font-medium">{label}</span>
        {amount != null && <span className="text-sm font-bold text-[#191B23]">₹{amount.toFixed(0)}</span>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {/* Received toggle */}
        <Toggle
          label="Received"
          checked={received}
          disabled={settled}
          onChange={val => onToggle(receivedField, val)}
          color="blue"
        />
        {/* Paid toggle */}
        {hasPaid && paidField && (
          <Toggle
            label="Paid"
            checked={!!paid}
            disabled={settled || !received}
            onChange={val => onToggle(paidField, val)}
            color="green"
          />
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
