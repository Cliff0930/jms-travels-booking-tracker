'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, CheckCircle2, Circle, ChevronDown, ChevronUp,
  CalendarDays, Download, RotateCcw, Plus, AlertTriangle, Clock, ArrowRight, Phone, Navigation,
  X, User, Banknote, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import Link from 'next/link'
import type { ReimbursementSheet, Driver, Company } from '@/types'
import { TripsheetEditPopup } from '@/components/billing/TripsheetEditPopup'
import { DriverSearchCombobox } from '@/components/shared/DriverSearchCombobox'
import { CompanyCombobox } from '@/components/shared/CompanyCombobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Tab = 'active' | 'missing' | 'pending' | 'settled'

interface CollectionEntry {
  id: string; driver_id: string; amount: number; created_at: string; note: string | null; booking_id: string | null
  driver: { id: string; name: string }
  booking: { booking_ref: string } | null
}

export default function ReimbursementsPage() {
  const [tab, setTab] = useState<Tab>('pending')
  const [showDriverSummary, setShowDriverSummary] = useState(false)
  const [driverId, setDriverId] = useState<string>('all')
  const [companyId, setCompanyId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientLabel, setClientLabel] = useState('')
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const clientPickerRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const qc = useQueryClient()

  // Always-on counts for badges (unfiltered — global)
  const { data: activeAll = [] } = useQuery<ReimbursementSheet[]>({
    queryKey: ['reimbursements-active-count'],
    queryFn: () => fetch('/api/reimbursements?status=active').then(r => r.json()),
  })
  const { data: missingAll = [] } = useQuery<ReimbursementSheet[]>({
    queryKey: ['reimbursements-missing-count'],
    queryFn: () => fetch('/api/reimbursements?status=missing').then(r => r.json()),
  })

  // Main cards — filtered by current tab + controls
  const qKey = ['reimbursements', tab, driverId, companyId, clientId, search, dateFrom, dateTo] as const
  const { data: sheets = [], isLoading } = useQuery<ReimbursementSheet[]>({
    queryKey: qKey,
    queryFn: () => {
      const params = new URLSearchParams({ status: tab })
      if (driverId !== 'all') params.set('driver_id', driverId)
      if (companyId) params.set('company_id', companyId)
      if (clientId) params.set('client_id', clientId)
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)
      return fetch(`/api/reimbursements?${params}`).then(r => r.json())
    },
  })

  // Driver dropdown populated from all entries
  const { data: allDriverSheets = [] } = useQuery<ReimbursementSheet[]>({
    queryKey: ['reimbursements-all-drivers'],
    queryFn: () => fetch('/api/reimbursements?status=all').then(r => r.json()),
  })

  const driversForCombobox = useMemo<Driver[]>(() => {
    const seen = new Map<string, Driver>()
    for (const s of allDriverSheets) {
      if (s.driver_id && s.driver_name && !seen.has(s.driver_id)) {
        seen.set(s.driver_id, {
          id: s.driver_id,
          name: s.driver_name,
          phone: s.driver_phone ?? '',
          vehicle_name: s.driver_vehicle_name ?? '',
          vehicle_number: s.driver_vehicle_number ?? '',
        } as Driver)
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allDriverSheets])

  const companiesForFilter = useMemo<Company[]>(() => {
    const seen = new Map<string, string>()
    for (const s of allDriverSheets) {
      if (s.company_id && s.company_name && !seen.has(s.company_id))
        seen.set(s.company_id, s.company_name)
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name } as Company))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allDriverSheets])

  // Reset client filter when company changes
  useEffect(() => {
    setClientId('')
    setClientSearch('')
    setClientLabel('')
  }, [companyId])

  // Close client picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (clientPickerRef.current && !clientPickerRef.current.contains(e.target as Node))
        setClientPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: clientResults = [] } = useQuery<Array<{ id: string; name: string; primary_phone: string | null }>>({
    queryKey: ['client-filter-search', clientSearch, companyId],
    queryFn: () => {
      const p = new URLSearchParams({ q: clientSearch.trim() })
      if (companyId) p.set('company_any', companyId)
      return fetch(`/api/clients?${p}`).then(r => r.json())
    },
    enabled: clientSearch.trim().length >= 1 && !clientId,
    staleTime: 10_000,
  })

  const hasActiveFilters = driverId !== 'all' || companyId !== '' || clientId !== '' || search !== '' || dateFrom !== '' || dateTo !== ''

  function clearAll() {
    setDriverId('all')
    setCompanyId('')
    setClientId('')
    setClientSearch('')
    setClientLabel('')
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  // Per-driver pending totals (pending tab only, from currently filtered sheets)
  const driverTotals = useMemo(() => {
    if (tab !== 'pending') return []
    const map = new Map<string, { driver_id: string; driver_name: string; total: number; trips: number }>()
    for (const s of sheets) {
      if (!s.driver_id || !s.driver_name) continue
      const rej = new Set((s.rejected_items ?? '').split(',').filter(Boolean))
      const sp = s as unknown as Record<string, unknown>
      const add = (key: string, amt: number | null) =>
        amt != null && !rej.has(key) && !sp[`${key}_paid`] ? amt : 0
      const tripTotal = add('toll', s.toll_amount) + add('parking', s.parking_amount)
        + add('permit', s.permit_amount) + add('bata', s.bata_amount)
      if (!map.has(s.driver_id)) map.set(s.driver_id, { driver_id: s.driver_id, driver_name: s.driver_name, total: 0, trips: 0 })
      const row = map.get(s.driver_id)!
      row.total += tripTotal
      row.trips += 1
    }
    return Array.from(map.values()).filter(r => r.total > 0).sort((a, b) => b.total - a.total)
  }, [sheets, tab])

  // Outstanding = sum of all unpaid items (not rejected) on pending tab
  const outstanding = useMemo(() => {
    if (tab !== 'pending') return 0
    return sheets.reduce((sum, s) => {
      const rej = new Set((s.rejected_items ?? '').split(',').filter(Boolean))
      const def = new Set((s.deferred_items ?? '').split(',').filter(Boolean))
      const sp = s as unknown as Record<string, unknown>
      const add = (key: string, amt: number | null) =>
        amt != null && !rej.has(key) && !def.has(key) && !sp[`${key}_paid`]
          ? amt : 0
      return sum + add('toll', s.toll_amount) + add('parking', s.parking_amount)
        + add('permit', s.permit_amount) + add('bata', s.bata_amount)
    }, 0)
  }, [sheets, tab])

  const deferredTotal = useMemo(() => {
    if (tab !== 'pending') return 0
    return sheets.reduce((sum, s) => {
      const def = new Set((s.deferred_items ?? '').split(',').filter(Boolean))
      const add = (key: string, amt: number | null) => amt != null && def.has(key) ? amt : 0
      return sum + add('toll', s.toll_amount) + add('parking', s.parking_amount)
        + add('permit', s.permit_amount) + add('bata', s.bata_amount)
    }, 0)
  }, [sheets, tab])

  // Outstanding client collections (driver collected from client, owes JMS)
  const { data: pendingCollections = [], refetch: refetchCollections } = useQuery<CollectionEntry[]>({
    queryKey: ['driver-advances-collections'],
    queryFn: () => fetch('/api/driver-advances?status=outstanding&type=collection').then(r => r.json()),
  })
  const [collectEntry, setCollectEntry] = useState<CollectionEntry | null>(null)
  const [collectVia, setCollectVia] = useState('')
  const [collectDate, setCollectDate] = useState('')
  const [collectNote, setCollectNote] = useState('')
  const [collecting, setCollecting] = useState(false)
  const markingId = null // kept for TripCard prop compat

  function openCollectDialog(entry: CollectionEntry) {
    setCollectEntry(entry); setCollectVia(''); setCollectDate(''); setCollectNote('')
  }
  function closeCollectDialog() {
    setCollectEntry(null); setCollectVia(''); setCollectDate(''); setCollectNote('')
  }

  async function handleConfirmCollected() {
    if (!collectEntry || !collectVia) return
    setCollecting(true)
    try {
      const settled_at = collectDate ? new Date(collectDate).toISOString() : new Date().toISOString()
      const res = await fetch(`/api/driver-advances/${collectEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'settled', settled_via: collectVia, note: collectNote || collectEntry.note, settled_at }),
      })
      if (!res.ok) throw new Error()
      toast.success('Marked as received')
      refetchCollections()
      closeCollectDialog()
    } catch {
      toast.error('Failed to update')
    } finally {
      setCollecting(false)
    }
  }

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
      if (data.reimbursed_at !== prevSheet?.reimbursed_at || data.tripsheet_doc_received !== prevSheet?.tripsheet_doc_received) {
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

  async function toggleSetItem(
    sheetId: string,
    field: 'rejected_items' | 'deferred_items',
    itemKey: string,
    current: string | null,
  ) {
    const set = new Set((current ?? '').split(',').filter(Boolean))
    set.has(itemKey) ? set.delete(itemKey) : set.add(itemKey)
    const newVal = Array.from(set).join(',') || null
    const prev = qc.getQueryData<ReimbursementSheet[]>(qKey)
    qc.setQueryData<ReimbursementSheet[]>(qKey, old =>
      old?.map(s => s.sheet_id === sheetId ? { ...s, [field]: newVal } : s) ?? []
    )
    try {
      const data = await patchSheet(sheetId, { [field]: newVal })
      const prevSheet = prev?.find(s => s.sheet_id === sheetId)
      if (data.reimbursed_at !== prevSheet?.reimbursed_at) {
        qc.invalidateQueries({ queryKey: ['reimbursements'] })
      }
    } catch {
      qc.setQueryData(qKey, prev)
      toast.error('Failed to update')
    }
  }

  async function settleAll(sheetId: string, sheet: ReimbursementSheet) {
    const rejected = new Set((sheet.rejected_items ?? '').split(',').filter(Boolean))
    const update: Record<string, unknown> = { tripsheet_doc_received: true }
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
      toast.success('Settlement revoked')
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
    XLSX.writeFile(wb, `reimbursements-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const activeCount = activeAll.length
  const missingCount = missingAll.length

  return (
    <div>
      <PageHeader
        title="Reimbursements"
        description="Track tripsheet collection and driver payments"
      />

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {activeCount > 0 && tab !== 'active' && (
          <button
            onClick={() => setTab('active')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <Navigation className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">{activeCount} trip{activeCount !== 1 ? 's' : ''} in progress</span>
          </button>
        )}
        {missingCount > 0 && tab !== 'missing' && (
          <button
            onClick={() => setTab('missing')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">{missingCount} tripsheet{missingCount !== 1 ? 's' : ''} missing</span>
          </button>
        )}
        {tab === 'pending' && outstanding > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
            <Clock className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">₹{outstanding.toFixed(0)} to pay now</span>
          </div>
        )}
        {tab === 'pending' && deferredTotal > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600">
            <ArrowRight className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">₹{deferredTotal.toFixed(0)} in settlement</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/bookings/offline-trip">
            <Button size="sm" className="h-9 text-xs gap-1.5 bg-[#7E3AF2] hover:bg-[#6C2BD9]">
              <Plus className="w-3.5 h-3.5" /> Offline Trip
            </Button>
          </Link>
          {tab !== 'active' && (
            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 border-[#C3C5D7]" onClick={exportExcel} disabled={sheets.length === 0}>
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Tabs */}
        <div className="flex rounded-lg border border-[#C3C5D7] overflow-hidden text-sm">
          {([
            { key: 'pending' as Tab, label: 'Pending', badge: 0, badgeColor: '' },
            { key: 'missing' as Tab, label: 'Missing Tripsheet', badge: missingCount, badgeColor: 'red' },
            { key: 'settled' as Tab, label: 'Settled', badge: 0, badgeColor: '' },
            { key: 'active' as Tab, label: 'In Progress', badge: activeCount, badgeColor: 'amber' },
          ]).map(t => {
            const isActive = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setShowDriverSummary(false) }}
                className={`px-4 py-2 font-semibold transition-colors flex items-center gap-1.5 ${
                  isActive ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#6B7280] hover:bg-[#F3F3FE]'
                }`}
              >
                {t.label}
                {t.badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white text-[#1A56DB]'
                    : t.badgeColor === 'red' ? 'bg-red-100 text-red-600'
                    : 'bg-amber-100 text-amber-700'
                  }`}>{t.badge}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Driver filter */}
        <div className="w-44">
          <DriverSearchCombobox
            value={driverId === 'all' ? '' : driverId}
            drivers={driversForCombobox}
            onSelect={id => setDriverId(id || 'all')}
            placeholder="All drivers"
          />
        </div>

        {/* Company filter */}
        <div className="w-44">
          <CompanyCombobox
            value={companyId}
            companies={companiesForFilter}
            onChange={id => setCompanyId(id)}
            placeholder="All companies"
          />
        </div>

        {/* Customer filter */}
        <div className="relative w-44" ref={clientPickerRef}>
          {clientId ? (
            <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-[#C3C5D7] bg-white">
              <User className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span className="flex-1 text-sm text-[#191B23] truncate">{clientLabel}</span>
              <button
                type="button"
                onClick={() => { setClientId(''); setClientSearch(''); setClientLabel('') }}
                className="shrink-0 text-[#9CA3AF] hover:text-[#191B23] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-[#C3C5D7] bg-white">
              <User className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <input
                type="text"
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientPickerOpen(true) }}
                onFocus={() => setClientPickerOpen(true)}
                placeholder={companyId ? 'Customer…' : 'All customers'}
                className="flex-1 text-sm bg-transparent outline-none text-[#191B23] placeholder:text-[#9CA3AF] min-w-0"
              />
              {clientSearch && (
                <button type="button" onClick={() => setClientSearch('')} className="shrink-0 text-[#9CA3AF] hover:text-[#191B23]">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {clientPickerOpen && !clientId && clientResults.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {clientResults.slice(0, 10).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setClientId(c.id)
                    setClientLabel(c.name)
                    setClientSearch('')
                    setClientPickerOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#EEF2FF] transition-colors border-b border-[#F3F4F6] last:border-0"
                >
                  <div className="text-sm font-medium text-[#191B23]">{c.name}</div>
                  {c.primary_phone && <div className="text-xs text-[#737686]">{c.primary_phone}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#737686]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, driver…"
            className="pl-9 border-[#C3C5D7] h-9 text-sm"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5 shrink-0">
          <CalendarDays className="w-3.5 h-3.5 text-[#737686]" />
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border-[#C3C5D7] h-9 text-sm w-36" />
          <span className="text-xs text-[#737686]">–</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border-[#C3C5D7] h-9 text-sm w-36" />
        </div>

        {/* Clear all */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 text-xs text-[#737686] hover:text-[#374151] px-2.5 py-2 rounded-md border border-[#C3C5D7] hover:border-[#9CA3AF] transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Clear all
          </button>
        )}

        {/* By Driver toggle — pending tab only */}
        {tab === 'pending' && driverTotals.length > 1 && (
          <button
            onClick={() => setShowDriverSummary(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-md border transition-colors shrink-0 ${
              showDriverSummary
                ? 'bg-blue-700 text-white border-blue-700'
                : 'text-[#374151] border-[#C3C5D7] hover:border-[#9CA3AF]'
            }`}
          >
            By Driver
          </button>
        )}
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading…</div>
      ) : sheets.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-3xl mb-3">
            {tab === 'active' ? '🛣️' : tab === 'missing' ? '✅' : tab === 'pending' ? '🎉' : '📋'}
          </p>
          <p className="text-[#374151] font-semibold text-sm">
            {tab === 'active'
              ? 'No trips currently in progress'
              : tab === 'missing'
              ? 'All completed trips have tripsheets — nothing missing!'
              : tab === 'pending'
              ? 'No pending items — all caught up'
              : 'No settled records yet'}
          </p>
        </div>
      ) : tab === 'active' ? (
        <div className="space-y-3">
          {sheets.map(sheet => (
            <InProgressCard key={sheet.booking_id} sheet={sheet} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Per-driver summary cards — shown only when toggled */}
          {tab === 'pending' && showDriverSummary && driverTotals.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-1">
              {driverTotals.map(d => (
                <button
                  key={d.driver_id}
                  onClick={() => setDriverId(d.driver_id)}
                  className="text-left bg-white rounded-xl border border-[#C3C5D7] p-3 shadow-sm hover:border-blue-400 hover:shadow-md transition-all"
                >
                  <div className="text-xs font-semibold text-[#191B23] truncate">{d.driver_name}</div>
                  <div className="text-lg font-bold text-[#DC2626] mt-1">₹{d.total.toLocaleString('en-IN')}</div>
                  <div className="text-[10px] text-[#737686] mt-0.5">{d.trips} trip{d.trips !== 1 ? 's' : ''} pending</div>
                </button>
              ))}
            </div>
          )}

          {sheets.map(sheet => (
            <TripCard
              key={sheet.sheet_id ?? sheet.booking_id}
              sheet={sheet}
              tab={tab}
              onToggle={toggleFlag}
              onSettleAll={settleAll}
              onRevoke={revokeSettlement}
              onToggleSetItem={toggleSetItem}
              collections={pendingCollections.filter(c => c.booking_id === sheet.booking_id)}
              markingId={markingId}
              onMarkCollected={openCollectDialog}
            />
          ))}
        </div>
      )}

      {/* Mark Collection as Received dialog */}
      <Dialog open={!!collectEntry} onOpenChange={o => { if (!o) closeCollectDialog() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Collection as Received</DialogTitle></DialogHeader>
          {collectEntry && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Driver</span><span className="font-medium">{collectEntry.driver?.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-semibold text-orange-600">₹{Number(collectEntry.amount).toLocaleString('en-IN')}</span></div>
                {collectEntry.note && <div className="flex justify-between"><span className="text-gray-500">Note</span><span className="text-gray-700 truncate max-w-[200px]">{collectEntry.note}</span></div>}
              </div>
              <div className="space-y-1.5">
                <Label>How was it received? *</Label>
                <div className="flex gap-2 flex-wrap">
                  {['Cash Returned', 'Bank Transfer', 'Salary Deduction'].map(v => (
                    <button key={v} onClick={() => setCollectVia(v)}
                      className={cn('px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors', collectVia === v ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300')}
                    >{v}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collect-date">Date Received <span className="text-gray-400 font-normal">(leave blank for today)</span></Label>
                <Input id="collect-date" type="date" value={collectDate} onChange={e => setCollectDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="collect-note">Note (optional)</Label>
                <Input id="collect-note" value={collectNote} onChange={e => setCollectNote(e.target.value)} placeholder="e.g. Cash received on 16 Jun" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeCollectDialog}>Cancel</Button>
            <Button onClick={handleConfirmCollected} disabled={!collectVia || collecting}>
              {collecting ? 'Saving…' : 'Confirm Received'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InProgressCard({ sheet }: { sheet: ReimbursementSheet }) {
  const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
    confirmed:       { label: 'Confirmed',       bg: 'bg-gray-100',   text: 'text-gray-600'   },
    driver_assigned: { label: 'Driver Assigned', bg: 'bg-indigo-100', text: 'text-indigo-700' },
    in_progress:     { label: 'On Trip',         bg: 'bg-amber-100',  text: 'text-amber-700'  },
  }
  const cfg = STATUS_CONFIG[sheet.booking_status] ?? { label: sheet.booking_status, bg: 'bg-gray-100', text: 'text-gray-600' }

  return (
    <div className={`bg-white rounded-xl border shadow-sm px-4 py-3 ${
      sheet.booking_status === 'in_progress' ? 'border-amber-200' : 'border-[#C3C5D7]'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Row 1: status + ref + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
            <Link
              href={`/bookings/${sheet.booking_id}`}
              className="text-sm font-bold text-[#1A56DB] hover:underline underline-offset-2"
            >
              {sheet.booking_ref}
            </Link>
            {sheet.trip_type && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                sheet.trip_type === 'local' ? 'bg-blue-100 text-blue-700'
                : sheet.trip_type === 'outstation' ? 'bg-orange-100 text-orange-700'
                : 'bg-purple-100 text-purple-700'
              }`}>{sheet.trip_type}</span>
            )}
            {sheet.company_name && (
              <span className="text-xs bg-[#EEF2FF] text-[#4F46E5] px-2 py-0.5 rounded-full font-medium">{sheet.company_name}</span>
            )}
          </div>

          {/* Row 2: driver + vehicle + phone */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs">
            {sheet.driver_name && <span className="font-semibold text-[#191B23]">{sheet.driver_name}</span>}
            {sheet.driver_vehicle_name && <span className="text-[#737686]">{sheet.driver_vehicle_name}</span>}
            {sheet.driver_vehicle_number && (
              <span className="font-mono bg-[#F3F4F6] text-[#374151] px-1.5 py-0.5 rounded">{sheet.driver_vehicle_number}</span>
            )}
            {sheet.driver_phone && (
              <a
                href={`tel:${sheet.driver_phone}`}
                onClick={e => e.stopPropagation()}
                className="flex items-center gap-1 text-[#1A56DB] hover:underline"
              >
                <Phone className="w-3 h-3" />{sheet.driver_phone}
              </a>
            )}
          </div>

          {/* Row 3: date + time + traveller */}
          <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-[#737686]">
            {sheet.pickup_date && (
              <span>{new Date(sheet.pickup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
            )}
            {sheet.pickup_time && <span className="font-medium text-[#374151]">{sheet.pickup_time.slice(0, 5)}</span>}
            {(sheet.guest_name || sheet.requested_by) && (
              <span className="text-[#374151] font-medium">{sheet.guest_name || sheet.requested_by}</span>
            )}
          </div>

          {/* Row 4: pickup → drop */}
          {(sheet.pickup_location || sheet.drop_location) && (
            <div className="flex items-center gap-1 mt-1 text-xs text-[#737686]">
              {sheet.pickup_location && <span className="truncate max-w-[220px]">{sheet.pickup_location}</span>}
              {sheet.pickup_location && sheet.drop_location && <ArrowRight className="w-3 h-3 shrink-0 text-[#9CA3AF]" />}
              {sheet.drop_location && <span className="truncate max-w-[220px]">{sheet.drop_location}</span>}
            </div>
          )}
        </div>

        <Link
          href={`/bookings/${sheet.booking_id}`}
          className="shrink-0 text-xs text-[#737686] hover:text-[#1A56DB] transition-colors whitespace-nowrap"
        >
          View →
        </Link>
      </div>
    </div>
  )
}

function TripCard({
  sheet, tab, onToggle, onSettleAll, onRevoke, onToggleSetItem,
  collections = [], markingId = null, onMarkCollected,
}: {
  sheet: ReimbursementSheet
  tab: Tab
  onToggle: (sheetId: string, field: string, value: boolean) => void
  onSettleAll: (sheetId: string, sheet: ReimbursementSheet) => void
  onRevoke: (sheetId: string) => void
  onToggleSetItem: (sheetId: string, field: 'rejected_items' | 'deferred_items', itemKey: string, current: string | null) => void
  collections?: CollectionEntry[]
  markingId?: string | null
  onMarkCollected?: (entry: CollectionEntry) => void
}) {
  const [expanded, setExpanded] = useState(tab !== 'settled')
  const [showTripsheet, setShowTripsheet] = useState(false)
  const qc = useQueryClient()
  const sheetId = sheet.sheet_id ?? ''
  const rejectedSet = new Set((sheet.rejected_items ?? '').split(',').filter(Boolean))
  const deferredSet = new Set((sheet.deferred_items ?? '').split(',').filter(Boolean))

  const sheetRaw = sheet as unknown as Record<string, unknown>
  const totalOwed = (['toll', 'parking', 'permit', 'bata'] as const).reduce((sum, key) => {
    if (rejectedSet.has(key) || deferredSet.has(key)) return sum
    const amt = key === 'bata' ? sheet.bata_amount : sheetRaw[`${key}_amount`] as number | null
    return sum + (amt ?? 0)
  }, 0)

  const borderClass = tab === 'missing'
    ? 'border-red-200'
    : tab === 'settled'
    ? 'border-[#A7F3D0]'
    : 'border-[#C3C5D7]'

  const headerBg = tab === 'missing'
    ? 'bg-red-50'
    : tab === 'settled'
    ? 'bg-[#ECFDF5]'
    : 'bg-[#F9FAFB]'

  return (
    <div className={`bg-white rounded-xl border ${borderClass} shadow-sm overflow-hidden`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 cursor-pointer select-none ${headerBg}`}
        onClick={() => sheet.has_tripsheet && setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {tab === 'missing'
            ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            : tab === 'settled'
            ? <CheckCircle2 className="w-4 h-4 text-[#059669] shrink-0" />
            : <Circle className="w-4 h-4 text-[#9CA3AF] shrink-0" />
          }
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowTripsheet(true) }}
                className="text-sm font-bold text-[#1A56DB] hover:underline underline-offset-2"
              >
                {sheet.booking_ref}
              </button>
              {sheet.tripsheet_number && (
                <span className="text-xs font-mono bg-[#F3F4F6] text-[#374151] px-1.5 py-0.5 rounded">TS#{sheet.tripsheet_number}</span>
              )}
              {sheet.driver_name && <span className="text-sm font-semibold text-[#191B23]">{sheet.driver_name}</span>}
              {sheet.driver_vehicle_name && <span className="text-xs text-[#737686]">· {sheet.driver_vehicle_name}</span>}
              {sheet.driver_vehicle_number && (
                <span className="text-xs font-mono bg-[#F3F4F6] text-[#374151] px-1.5 py-0.5 rounded">{sheet.driver_vehicle_number}</span>
              )}
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
                  : 'bg-indigo-100 text-indigo-700'
                }`}>{sheet.booking_status.replace('_', ' ')}</span>
              )}
              {sheet.company_name && (
                <span className="text-xs bg-[#EEF2FF] text-[#4F46E5] px-2 py-0.5 rounded-full font-medium">{sheet.company_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {sheet.pickup_date && (
                <span className="text-xs text-[#737686]">
                  {new Date(sheet.pickup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                </span>
              )}
              {(sheet.guest_name || sheet.requested_by) && (
                <span className="text-xs text-[#374151] font-medium">{sheet.guest_name || sheet.requested_by}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 ml-2">
          {totalOwed > 0 && (
            <span className={`text-sm font-bold ${tab === 'settled' ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
              ₹{totalOwed.toFixed(0)}
            </span>
          )}
          {tab === 'settled' && sheet.reimbursed_at && (
            <span className="text-xs text-[#059669]">
              Settled {new Date(sheet.reimbursed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {sheet.has_tripsheet && (
            expanded
              ? <ChevronUp className="w-4 h-4 text-[#737686]" />
              : <ChevronDown className="w-4 h-4 text-[#737686]" />
          )}
        </div>
      </div>

      {showTripsheet && (
        <TripsheetEditPopup
          bookingId={sheet.booking_id}
          tripSheetId={sheetId}
          bookingRef={sheet.booking_ref}
          tripType={sheet.trip_type}
          onClose={() => setShowTripsheet(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['reimbursements'] })
            qc.invalidateQueries({ queryKey: ['reimbursements-missing-count'] })
          }}
        />
      )}

      {/* Missing — CTA body */}
      {tab === 'missing' && (
        <div className="px-4 py-4 flex items-center justify-between border-t border-red-100 bg-white">
          <p className="text-sm text-[#6B7280]">No tripsheet submitted yet.</p>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-[#1A56DB] hover:bg-[#1741B6]"
            onClick={e => { e.stopPropagation(); setShowTripsheet(true) }}
          >
            <Plus className="w-3.5 h-3.5" /> Create Tripsheet
          </Button>
        </div>
      )}

      {/* Pending / Settled body */}
      {sheet.has_tripsheet && expanded && (
        <div className="px-4 py-3 space-y-0.5">
          {/* GPS/time strip for bata verification */}
          {(() => {
            const fmt = (t: string | null | undefined) => {
              if (!t) return '—'
              if (t.includes('T') || t.includes('Z'))
                return new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
              return t
            }
            const hasAny = sheet.manual_opening_time || sheet.manual_closing_time || sheet.opening_time || sheet.closing_time
            if (!hasAny) return null
            const dateLabel = sheet.trip_type === 'outstation' && sheet.leg_date
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

          {/* Tripsheet doc row */}
          <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6]">
            <span className="text-sm text-[#374151] font-medium">Tripsheet Document</span>
            <ToggleChip
              label="Received"
              checked={sheet.tripsheet_doc_received}
              disabled={tab === 'settled'}
              color="blue"
              onChange={val => onToggle(sheetId, 'tripsheet_doc_received', val)}
            />
          </div>

          {sheet.toll_amount != null && (
            <PayRow
              label="Toll"
              amount={sheet.toll_amount}
              receivedField="toll_received"
              paidField="toll_paid"

              received={sheet.toll_received}
              paid={sheet.toll_paid}
              deferred={deferredSet.has('toll')}
              rejected={rejectedSet.has('toll')}
              settled={tab === 'settled'}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onDefer={() => onToggleSetItem(sheetId, 'deferred_items', 'toll', sheet.deferred_items)}
              onReject={() => onToggleSetItem(sheetId, 'rejected_items', 'toll', sheet.rejected_items)}
            />
          )}

          {sheet.parking_amount != null && (
            <PayRow
              label="Parking"
              amount={sheet.parking_amount}
              receivedField="parking_received"
              paidField="parking_paid"

              received={sheet.parking_received}
              paid={sheet.parking_paid}
              deferred={deferredSet.has('parking')}
              rejected={rejectedSet.has('parking')}
              settled={tab === 'settled'}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onDefer={() => onToggleSetItem(sheetId, 'deferred_items', 'parking', sheet.deferred_items)}
              onReject={() => onToggleSetItem(sheetId, 'rejected_items', 'parking', sheet.rejected_items)}
            />
          )}

          {sheet.permit_amount != null && (
            <PayRow
              label="Permit"
              amount={sheet.permit_amount}
              receivedField="permit_received"
              paidField="permit_paid"

              received={sheet.permit_received}
              paid={sheet.permit_paid}
              deferred={deferredSet.has('permit')}
              rejected={rejectedSet.has('permit')}
              settled={tab === 'settled'}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onDefer={() => onToggleSetItem(sheetId, 'deferred_items', 'permit', sheet.deferred_items)}
              onReject={() => onToggleSetItem(sheetId, 'rejected_items', 'permit', sheet.rejected_items)}
            />
          )}

          {sheet.bata_driver != null && (
            <PayRow
              label={`Bata (${sheet.bata_driver}×${sheet.bata_rate != null ? `₹${sheet.bata_rate}` : '?'})`}
              amount={sheet.bata_amount ?? undefined}
              receivedField="bata_received"
              paidField="bata_paid"

              received={sheet.bata_received}
              paid={sheet.bata_paid}
              deferred={deferredSet.has('bata')}
              rejected={rejectedSet.has('bata')}
              settled={tab === 'settled'}
              onToggle={(field, val) => onToggle(sheetId, field, val)}
              onDefer={() => onToggleSetItem(sheetId, 'deferred_items', 'bata', sheet.deferred_items)}
              onReject={() => onToggleSetItem(sheetId, 'rejected_items', 'bata', sheet.rejected_items)}
            />
          )}

          {/* Client collections linked to this booking */}
          {collections.length > 0 && tab === 'pending' && (
            <div className="mt-2 space-y-1.5">
              {collections.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <Banknote className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                    <span className="text-xs font-semibold text-orange-800">
                      ₹{Number(c.amount).toLocaleString('en-IN')} collected from client
                    </span>
                    {c.note && <span className="text-xs text-orange-600 truncate">· {c.note}</span>}
                  </div>
                  <button
                    onClick={() => onMarkCollected?.(c)}
                    disabled={markingId === c.id}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    {markingId === c.id ? 'Saving…' : 'Mark Received'}
                  </button>
                </div>
              ))}
              <p className="text-[10px] text-gray-400 pb-1">If not received, this amount will be deducted in the driver&apos;s monthly settlement.</p>
            </div>
          )}

          {/* Pending footer */}
          {tab === 'pending' && (
            <div className="flex items-center justify-end pt-3 border-t border-[#F3F4F6] mt-2">
              <Button
                size="sm"
                className="bg-[#059669] hover:bg-[#047857] gap-1.5 h-8 text-xs"
                onClick={() => onSettleAll(sheetId, sheet)}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Settle All
              </Button>
            </div>
          )}

          {/* Settled footer */}
          {tab === 'settled' && (
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
                  : <span className="text-[#1A56DB]">Doc received · payment via settlement</span>
                }
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PayRow({
  label, amount, receivedField, paidField,
  received, paid, deferred, rejected, settled,
  onToggle, onDefer, onReject,
}: {
  label: string
  amount?: number | null
  receivedField: string
  paidField: string
  received: boolean
  paid: boolean
  deferred: boolean
  rejected: boolean
  settled: boolean
  onToggle: (field: string, val: boolean) => void
  onDefer: () => void
  onReject: () => void
}) {
  if (rejected) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6] opacity-50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#374151] font-medium line-through">{label}</span>
          {amount != null && <span className="text-sm font-bold text-[#191B23] line-through">₹{amount.toFixed(0)}</span>}
          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">Rejected</span>
        </div>
        {!settled && (
          <button
            onClick={onReject}
            className="text-[11px] px-2 py-1 rounded border font-semibold border-orange-300 text-orange-600 bg-orange-50 hover:bg-orange-100"
          >
            ↩ Restore
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#F3F4F6] last:border-0 gap-2">
      {/* Label + amount */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-[#374151] font-medium">{label}</span>
        {amount != null && <span className="text-sm font-bold text-[#191B23]">₹{amount.toFixed(0)}</span>}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {/* Received toggle */}
        <ToggleChip
          label="Received"
          checked={received}
          disabled={settled || paid || deferred}
          color="blue"
          onChange={val => onToggle(receivedField, val)}
        />

        {/* Payment state — only shown after received */}
        {settled || paid ? (
          <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-[#059669] border border-green-200">
            <CheckCircle2 className="w-3 h-3" /> Paid
          </span>
        ) : received && deferred ? (
          <>
            <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
              <Clock className="w-3 h-3" /> In Settlement
            </span>
            <button
              onClick={onDefer}
              className="text-[11px] text-[#9CA3AF] hover:text-[#374151] underline underline-offset-1"
            >
              Undo
            </button>
          </>
        ) : received && !paid ? (
          <>
            <button
              onClick={() => onToggle(paidField, true)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full border border-[#059669] text-[#059669] hover:bg-green-50 transition-colors"
            >
              Pay Now
            </button>
            <button
              onClick={onDefer}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border border-[#C3C5D7] text-[#6B7280] hover:bg-[#F3F3FE] transition-colors"
            >
              <ArrowRight className="w-3 h-3" /> Settle Later
            </button>
          </>
        ) : null}

        {/* Reject — only shown when not settled, not paid, not deferred */}
        {!settled && !paid && !deferred && (
          <button
            onClick={onReject}
            className="text-[11px] px-2 py-1 rounded border font-semibold border-[#FCA5A5] text-[#DC2626] hover:bg-red-50"
          >
            ✕ Reject
          </button>
        )}
      </div>
    </div>
  )
}

function ToggleChip({ label, checked, disabled, color, onChange }: {
  label: string
  checked: boolean
  disabled: boolean
  color: 'blue' | 'green'
  onChange: (val: boolean) => void
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
