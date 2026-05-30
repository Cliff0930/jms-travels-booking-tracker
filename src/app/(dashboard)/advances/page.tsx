'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, IndianRupee, ChevronRight, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/hooks/useCurrentUser'

interface AdvanceEntry {
  id: string
  driver_id: string
  type: 'advance' | 'collection'
  amount: number
  payment_mode: 'cash' | 'phonepe' | 'gpay' | 'cc'
  note: string | null
  status: 'outstanding' | 'settled'
  settled_via: string | null
  settled_at: string | null
  created_at: string
  created_by: string | null
  booking_id: string | null
  driver: { id: string; name: string }
  booking: { booking_ref: string } | null
}

interface DriverBalance {
  driver_id: string
  driver_name: string
  advance_total: number
  collection_total: number
  total_owed: number
}

const MODE_LABELS: Record<string, string> = { cash: 'Cash', phonepe: 'PhonePe', gpay: 'GPay', cc: 'Card/CC' }
const TYPE_LABELS: Record<string, string> = { advance: 'Advance Given', collection: 'Client Collection' }
const SETTLE_VIA = ['Cash Returned', 'Bank Transfer', 'Salary Deduction']

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AdvancesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const qc = useQueryClient()
  const isAdmin = useIsAdmin()

  const preDriverId = searchParams.get('driver_id') ?? 'all'
  const [tab, setTab] = useState<'outstanding' | 'settled'>('outstanding')
  const [driverFilter, setDriverFilter] = useState(preDriverId)
  const [showAdd, setShowAdd] = useState(false)
  const [settleEntry, setSettleEntry] = useState<AdvanceEntry | null>(null)
  const [settleVia, setSettleVia] = useState('')
  const [settleNote, setSettleNote] = useState('')
  const [settling, setSettling] = useState(false)

  // Sync driver filter from URL param on mount
  useEffect(() => { if (preDriverId !== 'all') setDriverFilter(preDriverId) }, [preDriverId])

  const { data: entries = [], isLoading } = useQuery<AdvanceEntry[]>({
    queryKey: ['driver-advances', tab, driverFilter],
    queryFn: () => {
      const p = new URLSearchParams({ status: tab })
      if (driverFilter !== 'all') p.set('driver_id', driverFilter)
      return fetch(`/api/driver-advances?${p}`).then(r => r.json())
    },
  })

  // Also fetch all outstanding to build balance cards
  const { data: allOutstanding = [] } = useQuery<AdvanceEntry[]>({
    queryKey: ['driver-advances', 'outstanding', 'all'],
    queryFn: () => fetch('/api/driver-advances?status=outstanding').then(r => r.json()),
  })

  // Build per-driver balance map
  const balances = useMemo<DriverBalance[]>(() => {
    const map = new Map<string, DriverBalance>()
    for (const e of allOutstanding) {
      if (!map.has(e.driver_id)) {
        map.set(e.driver_id, { driver_id: e.driver_id, driver_name: e.driver?.name ?? '—', advance_total: 0, collection_total: 0, total_owed: 0 })
      }
      const b = map.get(e.driver_id)!
      if (e.type === 'advance') b.advance_total += Number(e.amount)
      else b.collection_total += Number(e.amount)
      b.total_owed += Number(e.amount)
    }
    const result = Array.from(map.values()).sort((a, b) => b.total_owed - a.total_owed)
    if (driverFilter !== 'all') return result.filter(b => b.driver_id === driverFilter)
    return result
  }, [allOutstanding, driverFilter])

  // Build driver list from all entries
  const driverList = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of allOutstanding) if (e.driver?.id) seen.set(e.driver.id, e.driver.name)
    for (const e of entries) if (e.driver?.id) seen.set(e.driver.id, e.driver.name)
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [allOutstanding, entries])

  async function handleSettle() {
    if (!settleEntry || !settleVia) return
    setSettling(true)
    try {
      const res = await fetch(`/api/driver-advances/${settleEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'settled', settled_via: settleVia, note: settleNote || settleEntry.note }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Entry marked as settled')
      qc.invalidateQueries({ queryKey: ['driver-advances'] })
      setSettleEntry(null); setSettleVia(''); setSettleNote('')
    } catch {
      toast.error('Failed to settle entry')
    } finally {
      setSettling(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this entry?')) return
    const res = await fetch(`/api/driver-advances/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['driver-advances'] }) }
    else toast.error('Delete failed')
  }

  const filteredEntries = driverFilter !== 'all' ? entries.filter(e => e.driver_id === driverFilter) : entries

  return (
    <div className="space-y-6">
      <PageHeader
        title="Advances"
        description="Track advances given to drivers and client payments collected by drivers"
        actions={<Button onClick={() => setShowAdd(true)} className="gap-2"><Plus className="w-4 h-4" />Add Entry</Button>}
      />

      {/* Driver filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={driverFilter} onValueChange={(v: string | null) => { const val = v ?? 'all'; setDriverFilter(val); router.replace(val !== 'all' ? `/advances?driver_id=${val}` : '/advances') }}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All Drivers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Drivers</SelectItem>
            {driverList.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Tabs */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['outstanding', 'settled'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('px-4 py-2 text-sm font-semibold transition-colors capitalize', tab === t ? 'bg-blue-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* Balance cards — only on outstanding tab */}
      {tab === 'outstanding' && balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {balances.map(b => (
            <div key={b.driver_id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-gray-900">{b.driver_name}</div>
                <button
                  onClick={() => { setDriverFilter(b.driver_id); router.replace(`/advances?driver_id=${b.driver_id}`) }}
                  className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                >View <ChevronRight className="w-3 h-3" /></button>
              </div>
              <div className="space-y-1 text-sm text-gray-600 mb-3">
                {b.advance_total > 0 && <div className="flex justify-between"><span>Advance taken</span><span className="font-medium text-gray-800">{fmt(b.advance_total)}</span></div>}
                {b.collection_total > 0 && <div className="flex justify-between"><span>Collected from clients</span><span className="font-medium text-gray-800">{fmt(b.collection_total)}</span></div>}
              </div>
              <div className="border-t border-dashed border-gray-200 pt-2 flex justify-between items-center">
                <span className="text-xs text-gray-500">Total owes JMS</span>
                <span className="text-lg font-bold text-orange-600">{fmt(b.total_owed)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Entry table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No {tab} entries{driverFilter !== 'all' ? ' for this driver' : ''}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Driver', 'Type', 'Amount', 'Mode', 'Booking', 'Note', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredEntries.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{e.driver?.name ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', e.type === 'advance' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700')}>
                        {TYPE_LABELS[e.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{fmt(Number(e.amount))}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{MODE_LABELS[e.payment_mode]}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{e.booking?.booking_ref ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[180px] truncate">{e.note ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {e.status === 'settled' ? (
                        <div>
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold"><Check className="w-3 h-3" />Settled</span>
                          {e.settled_via && <div className="text-[11px] text-gray-400">{e.settled_via}</div>}
                          {e.settled_at && <div className="text-[11px] text-gray-400">{fmtDate(e.settled_at)}</div>}
                        </div>
                      ) : (
                        <span className="flex items-center gap-1.5 text-orange-600 text-xs font-semibold">
                          <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Outstanding
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {e.status === 'outstanding' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setSettleEntry(e); setSettleVia(''); setSettleNote('') }}>
                            Settle
                          </Button>
                        )}
                        {isAdmin && (
                          <button onClick={() => handleDelete(e.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAdd && <AddEntryModal onClose={() => setShowAdd(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['driver-advances'] }); setShowAdd(false) }} />}

      {/* Settle Dialog */}
      <Dialog open={!!settleEntry} onOpenChange={o => { if (!o) { setSettleEntry(null); setSettleVia(''); setSettleNote('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark as Settled</DialogTitle></DialogHeader>
          {settleEntry && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Driver</span><span className="font-medium">{settleEntry.driver?.name}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Amount</span><span className="font-semibold text-orange-600">{fmt(Number(settleEntry.amount))}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{TYPE_LABELS[settleEntry.type]}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label>How was it settled? *</Label>
                <div className="flex gap-2 flex-wrap">
                  {SETTLE_VIA.map(v => (
                    <button key={v} onClick={() => setSettleVia(v)}
                      className={cn('px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors', settleVia === v ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300')}
                    >{v}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="settle-note">Note (optional)</Label>
                <Input id="settle-note" value={settleNote} onChange={e => setSettleNote(e.target.value)} placeholder="e.g. Cash received on 29 May" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSettleEntry(null); setSettleVia('') }}>Cancel</Button>
            <Button onClick={handleSettle} disabled={!settleVia || settling}>
              {settling ? 'Saving…' : 'Confirm Settled'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function stripPlate(s: string) { return s.replace(/[\s\-_]/g, '').toUpperCase() }

function AddEntryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [driverId, setDriverId] = useState('')
  const [driverSearch, setDriverSearch] = useState('')
  const [driverOpen, setDriverOpen] = useState(false)
  const [selectedDriverLabel, setSelectedDriverLabel] = useState('')
  const [type, setType] = useState<'advance' | 'collection'>('advance')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'cash' | 'phonepe' | 'gpay' | 'cc'>('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: drivers = [] } = useQuery<{ id: string; name: string; phone: string; vehicle_name: string; vehicle_number: string; is_active: boolean }[]>({
    queryKey: ['drivers-list-active'],
    queryFn: () => fetch('/api/drivers').then(r => r.json()),
  })
  const activeDrivers = drivers.filter(d => d.is_active !== false)

  const filteredDrivers = driverSearch.trim()
    ? activeDrivers.filter(d => {
        const q = driverSearch.toLowerCase()
        const qDigits = q.replace(/\D/g, '')
        const plateQ = stripPlate(driverSearch)
        const plateD = stripPlate(d.vehicle_number || '')
        return (
          d.name.toLowerCase().includes(q) ||
          (qDigits.length > 0 && (d.phone || '').replace(/\D/g, '').includes(qDigits)) ||
          (plateQ.length > 0 && plateD.includes(plateQ)) ||
          (plateQ.length >= 4 && plateD.endsWith(plateQ.slice(-4)))
        )
      })
    : activeDrivers

  // Booking combobox state
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [bookingSearch, setBookingSearch] = useState('')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedBookingLabel, setSelectedBookingLabel] = useState('')
  const [bookingWrongDriver, setBookingWrongDriver] = useState(false)

  interface DriverBooking {
    id: string; booking_ref: string; pickup_date: string | null
    pickup_location: string | null; trip_type: string | null
    status: string; is_settlement_duty: boolean; tripsheet_number: string | null
  }

  const { data: driverBookings = [] } = useQuery<DriverBooking[]>({
    queryKey: ['driver-bookings', driverId],
    queryFn: () => fetch(`/api/driver-bookings?driver_id=${driverId}`).then(r => r.json()),
    enabled: !!driverId,
  })

  function stripDigits(s: string) { return s.replace(/\D/g, '') }

  const filteredBookings = bookingSearch.trim()
    ? driverBookings.filter(b => {
        const q = bookingSearch.toLowerCase()
        const qDigits = stripDigits(bookingSearch)
        const tsDigits = stripDigits(b.tripsheet_number ?? '')
        return (
          b.booking_ref.toLowerCase().includes(q) ||
          (b.pickup_location ?? '').toLowerCase().includes(q) ||
          (qDigits.length > 0 && tsDigits.length > 0 && tsDigits.includes(qDigits))
        )
      })
    : driverBookings

  function fmtBookingRow(b: DriverBooking) {
    const parts = [
      b.pickup_date ? new Date(b.pickup_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null,
      b.trip_type ? b.trip_type.charAt(0).toUpperCase() + b.trip_type.slice(1) : null,
      b.pickup_location ?? null,
      b.tripsheet_number ? `TS: ${b.tripsheet_number}` : null,
    ].filter(Boolean)
    return parts.join(' · ')
  }

  function handleBookingSelect(b: DriverBooking) {
    setBookingId(b.id)
    setSelectedBookingLabel(b.booking_ref)
    setBookingSearch('')
    setBookingOpen(false)
    setBookingWrongDriver(false)
  }

  function handleBookingClear() {
    setBookingId(null)
    setSelectedBookingLabel('')
    setBookingSearch('')
    setBookingWrongDriver(false)
  }

  // Validate manual-typed ref against driver's bookings
  function handleBookingBlur() {
    setTimeout(() => setBookingOpen(false), 150)
    if (!bookingSearch.trim() || !driverId) return
    const match = driverBookings.find(b => b.booking_ref.toLowerCase() === bookingSearch.toLowerCase())
    if (match) {
      handleBookingSelect(match)
    } else if (bookingSearch.trim()) {
      setBookingWrongDriver(true)
      setBookingId(null)
    }
  }

  async function handleSave() {
    setError('')
    if (!driverId) { setError('Select a driver'); return }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) { setError('Enter a valid amount'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/driver-advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driver_id: driverId,
          booking_id: bookingId || null,
          type,
          amount: Number(amount),
          payment_mode: mode,
          note: note.trim() || null,
          created_at: new Date(date).toISOString(),
        }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Entry added')
      onSaved()
    } catch {
      setError('Failed to save entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Entry</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Driver *</Label>
            <div className="relative">
              <Input
                value={driverOpen ? driverSearch : selectedDriverLabel}
                onFocus={() => { setDriverOpen(true); setDriverSearch('') }}
                onChange={e => { setDriverSearch(e.target.value); setDriverOpen(true) }}
                onBlur={() => setTimeout(() => setDriverOpen(false), 150)}
                placeholder="Search by name, phone, or plate…"
                className={cn(driverId ? 'border-blue-400' : '')}
                autoComplete="off"
              />
              {driverOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {filteredDrivers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">No drivers found</div>
                  ) : filteredDrivers.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onMouseDown={() => {
                        setDriverId(d.id)
                        setSelectedDriverLabel(d.name)
                        setDriverSearch('')
                        setBookingId(null); setSelectedBookingLabel(''); setBookingSearch(''); setBookingWrongDriver(false)
                        setDriverOpen(false)
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors',
                        driverId === d.id && 'bg-blue-50'
                      )}
                    >
                      <div className="text-sm font-semibold text-gray-900">{d.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {[d.vehicle_name, d.vehicle_number, d.phone].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type *</Label>
            <div className="flex gap-2">
              {(['advance', 'collection'] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('flex-1 py-2 rounded-lg border text-sm font-semibold transition-colors', type === t ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300')}
                >{TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹) *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <Input className="pl-8" value={amount} onChange={e => setAmount(e.target.value)} type="number" inputMode="decimal" placeholder="0" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Payment Mode *</Label>
            <div className="flex gap-2 flex-wrap">
              {(['cash', 'phonepe', 'gpay', 'cc'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  className={cn('px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors', mode === m ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300')}
                >{MODE_LABELS[m]}</button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Booking Ref <span className="text-gray-400 font-normal">(optional)</span></Label>
            <div className="relative">
              {!driverId ? (
                <Input disabled placeholder="Select a driver first" className="bg-gray-50 text-gray-400" />
              ) : bookingId ? (
                <div className="flex items-center gap-2 border border-blue-400 rounded-md px-3 py-2 bg-blue-50">
                  <span className="flex-1 text-sm font-semibold text-blue-800">{selectedBookingLabel}</span>
                  <button type="button" onClick={handleBookingClear} className="text-blue-400 hover:text-blue-700 text-xs font-bold">✕ Clear</button>
                </div>
              ) : (
                <>
                  <Input
                    value={bookingOpen ? bookingSearch : ''}
                    onFocus={() => { setBookingOpen(true); setBookingSearch(''); setBookingWrongDriver(false) }}
                    onChange={e => { setBookingSearch(e.target.value); setBookingOpen(true); setBookingWrongDriver(false) }}
                    onBlur={handleBookingBlur}
                    placeholder="Search ref, location, or tripsheet…"
                    autoComplete="off"
                    className={cn(bookingWrongDriver ? 'border-red-400' : '')}
                  />
                  {bookingOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredBookings.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-400">No bookings found for this driver</div>
                      ) : filteredBookings.map(b => (
                        <button key={b.id} type="button" onMouseDown={() => handleBookingSelect(b)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{b.booking_ref}</span>
                            {b.is_settlement_duty && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">₹ SETTLEMENT</span>
                            )}
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto',
                              b.status === 'completed' ? 'bg-green-50 text-green-700' :
                              b.status === 'in_progress' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                            )}>{b.status.replace('_', ' ')}</span>
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5 truncate">{fmtBookingRow(b)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {bookingWrongDriver && (
                    <p className="text-xs text-red-600 mt-1">"{bookingSearch}" is not assigned to this driver</p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Petrol money for BK-0063" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add Entry'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdvancesPage() {
  return (
    <Suspense>
      <AdvancesContent />
    </Suspense>
  )
}
