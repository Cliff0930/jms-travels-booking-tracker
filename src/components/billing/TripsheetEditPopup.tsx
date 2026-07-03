'use client'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { toast } from 'sonner'
import { Gauge, Clock, IndianRupee, Calendar, Car, X, Save, ChevronRight, Tag, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TripSheet {
  id: string
  tripsheet_number: string | null
  opening_km: number | null
  closing_km: number | null
  manual_opening_time: string | null
  manual_closing_time: string | null
  trip_opening_date: string | null
  trip_closing_date: string | null
  toll_amount: number | null
  parking_amount: number | null
  permit_amount: number | null
  bata_driver: number | null
  bata_client: number | null
  driver_opening_km: number | null
  driver_closing_km: number | null
  driver_opening_time: string | null
  driver_closing_time: string | null
  driver_toll_amount: number | null
  driver_parking_amount: number | null
  driver_permit_amount: number | null
  client_opening_km: number | null
  client_closing_km: number | null
  client_opening_time: string | null
  client_closing_time: string | null
  client_toll_amount: number | null
  client_parking_amount: number | null
  client_permit_amount: number | null
  slab_override: string | null
}

interface Props {
  bookingId: string
  tripSheetId: string
  bookingRef: string
  tripType?: string | null
  invoiceId?: string
  lineItemId?: string
  onClose: () => void
  onSaved: () => void
}

type SaveMode = 'both' | 'driver' | 'client'
type Tab = 'actual' | 'driver' | 'client'

type Form = {
  tripsheet_number: string
  opening_km: string; closing_km: string
  manual_opening_time: string; manual_closing_time: string
  toll_amount: string; parking_amount: string; permit_amount: string
  driver_opening_km: string; driver_closing_km: string
  driver_opening_time: string; driver_closing_time: string
  driver_toll_amount: string; driver_parking_amount: string; driver_permit_amount: string
  bata_driver: string
  client_opening_km: string; client_closing_km: string
  client_opening_time: string; client_closing_time: string
  client_toll_amount: string; client_parking_amount: string; client_permit_amount: string
  bata_client: string
  trip_opening_date: string; trip_closing_date: string
}

const SLABS = [
  { id: '4HR',       label: '4hr/40km'        },
  { id: 'AIRPORT',   label: 'Airport 4hr/80km' },
  { id: '8HR',       label: '8hr/80km'         },
  { id: 'OUTSTATION', label: 'Outstation'       },
] as const

function detectAutoSlab(tripType: string | null | undefined, form: Form): string {
  if (tripType === 'outstation') return 'OUTSTATION'
  if (tripType === 'airport')    return 'AIRPORT'
  const openKm  = parseFloat(form.opening_km  || '0')
  const closeKm = parseFloat(form.closing_km  || '0')
  const actualKms = closeKm > openKm ? closeKm - openKm : 0
  const parseT = (t: string): number | null => {
    const p = t.split(':').map(Number)
    return p.length >= 2 && !isNaN(p[0]) ? p[0] * 60 + (p[1] || 0) : null
  }
  const o = parseT(form.manual_opening_time)
  const c = parseT(form.manual_closing_time)
  let mins = 0
  if (o !== null && c !== null) { mins = c - o; if (mins < 0) mins += 1440 }
  return actualKms <= 40 && Math.max(0, mins - 240) <= 105 ? '4HR' : '8HR'
}

function nn(v: number | null | undefined): string { return v != null ? String(v) : '' }
function ns(v: string | null | undefined): string { return v ?? '' }

function kmDiff(open: string, close: string): string | null {
  const a = parseFloat(open), b = parseFloat(close)
  if (isNaN(a) || isNaN(b) || b <= a) return null
  return `${(b - a).toFixed(0)} km`
}

function timeDiff(open: string, close: string): string | null {
  if (!open || !close) return null
  const [oh, om] = open.split(':').map(Number)
  const [ch, cm] = close.split(':').map(Number)
  if (isNaN(oh) || isNaN(om) || isNaN(ch) || isNaN(cm)) return null
  let mins = (ch * 60 + cm) - (oh * 60 + om)
  if (mins < 0) mins += 24 * 60
  if (mins === 0) return null
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function Chip({ children, color = 'green' }: { children: React.ReactNode; color?: 'green' | 'amber' | 'blue' }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
      color === 'green' && 'bg-emerald-100 text-emerald-700',
      color === 'amber' && 'bg-amber-100 text-amber-700',
      color === 'blue'  && 'bg-blue-100 text-blue-700',
    )}>
      {children}
    </span>
  )
}

function FieldRow({ label, icon: Icon, children }: { label: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wide flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </Label>
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, placeholder = '0' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF] font-medium">₹</span>
      <Input
        type="number"
        className="h-8 text-sm pl-6"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

export function TripsheetEditPopup({ bookingId, tripSheetId, bookingRef, tripType, invoiceId, lineItemId, onClose, onSaved }: Props) {
  const [sheet, setSheet] = useState<TripSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<SaveMode | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [tab, setTab] = useState<Tab>('actual')
  const [slabOverride, setSlabOverride] = useState<string | null>(null)
  const [billingVehicleType, setBillingVehicleType] = useState<string | null>(null)
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([])
  const [billingCompanyId, setBillingCompanyId] = useState<string | null>(null)
  const [groupCompanies, setGroupCompanies] = useState<{ id: string; name: string }[]>([])
  const [driverVehicleName, setDriverVehicleName] = useState<string | null>(null)
  const [bookingVehicleType, setBookingVehicleType] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [sheetsData, bookingRes] = await Promise.all([
          fetch(`/api/bookings/${bookingId}/trip-sheet`).then(r => r.json()) as Promise<TripSheet[]>,
          fetch(`/api/bookings/${bookingId}`).then(r => r.json()) as Promise<{
            billing_vehicle_type?: string | null; billing_company_id?: string | null; company_id?: string | null
            vehicle_type?: string | null
            driver?: { vehicle_name?: string | null } | null
            company?: { name?: string | null } | null
          }>,
        ])
        setBillingVehicleType(bookingRes.billing_vehicle_type ?? null)
        setBillingCompanyId(bookingRes.billing_company_id ?? null)
        setDriverVehicleName(bookingRes.driver?.vehicle_name ?? null)
        setBookingVehicleType(bookingRes.vehicle_type ?? null)
        setCompanyName(bookingRes.company?.name ?? null)
        const vehicleUrl = bookingRes.company_id
          ? `/api/billing/rate-cards?company_id=${bookingRes.company_id}`
          : '/api/billing/rate-cards?active=true'
        const [rateCards, groupRes] = await Promise.all([
          fetch(vehicleUrl).then(r => r.json()) as Promise<{ vehicle_type: string }[]>,
          bookingRes.company_id
            ? fetch(`/api/companies?group_of=${bookingRes.company_id}`).then(r => r.json()) as Promise<{ id: string; name: string }[]>
            : Promise.resolve([] as { id: string; name: string }[]),
        ])
        setVehicleTypes(rateCards.map(r => r.vehicle_type))
        setGroupCompanies(groupRes)
        let sheets: TripSheet[] = sheetsData

        if (sheets.length === 0) {
          const res = await fetch(`/api/bookings/${bookingId}/trip-sheet`, { method: 'POST' })
          if (res.ok) {
            const created: TripSheet = await res.json()
            sheets = [created]
          }
        }

        const s = sheets.find(x => x.id === tripSheetId) ?? sheets[0] ?? null
        setSheet(s)
        if (s) {
          setSlabOverride(s.slab_override ?? null)
          setForm({
            tripsheet_number:      ns(s.tripsheet_number),
            opening_km:            nn(s.opening_km),
            closing_km:            nn(s.closing_km),
            manual_opening_time:   ns(s.manual_opening_time),
            manual_closing_time:   ns(s.manual_closing_time),
            toll_amount:           nn(s.toll_amount),
            parking_amount:        nn(s.parking_amount),
            permit_amount:         nn(s.permit_amount),
            driver_opening_km:     nn(s.driver_opening_km  ?? s.opening_km),
            driver_closing_km:     nn(s.driver_closing_km  ?? s.closing_km),
            driver_opening_time:   ns(s.driver_opening_time  ?? s.manual_opening_time),
            driver_closing_time:   ns(s.driver_closing_time  ?? s.manual_closing_time),
            driver_toll_amount:    nn(s.driver_toll_amount),
            driver_parking_amount: nn(s.driver_parking_amount),
            driver_permit_amount:  nn(s.driver_permit_amount),
            bata_driver:           nn(s.bata_driver) || '0',
            client_opening_km:     nn(s.client_opening_km  ?? s.opening_km),
            client_closing_km:     nn(s.client_closing_km  ?? s.closing_km),
            client_opening_time:   ns(s.client_opening_time  ?? s.manual_opening_time),
            client_closing_time:   ns(s.client_closing_time  ?? s.manual_closing_time),
            client_toll_amount:    nn(s.client_toll_amount),
            client_parking_amount: nn(s.client_parking_amount),
            client_permit_amount:  nn(s.client_permit_amount),
            bata_client:           nn(s.bata_client) || '0',
            trip_opening_date:     ns(s.trip_opening_date),
            trip_closing_date:     ns(s.trip_closing_date),
          })
        }
      } catch {
        // silent — loading state cleared in finally
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [bookingId, tripSheetId])

  function set(key: keyof Form, val: string) {
    setForm(prev => prev ? { ...prev, [key]: val } : prev)
  }

  function n(v: string) { return v !== '' ? Number(v) : null }
  function s(v: string) { return v || null }

  async function patchSheet(body: Record<string, unknown>) {
    const res = await fetch(`/api/bookings/${bookingId}/trip-sheet?sheetId=${sheet!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to save tripsheet')
  }

  async function recalculate() {
    if (!invoiceId || !lineItemId) return
    const res = await fetch(`/api/billing/invoices/${invoiceId}/recalculate-line-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_item_id: lineItemId }),
    })
    if (!res.ok) throw new Error('Failed to recalculate invoice line item')
  }

  async function handleSave(mode: SaveMode) {
    if (!form || !sheet) return
    setSaving(mode)
    try {
      // Persist the billing overrides FIRST — recalculate() re-fetches the booking from the DB,
      // so it must see the new billing_vehicle_type/billing_company_id, not the stale pre-save value.
      await fetch(`/api/bookings/${bookingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billing_vehicle_type: billingVehicleType, billing_company_id: billingCompanyId }) })
      if (mode === 'both') {
        await patchSheet({
          tripsheet_number:      s(form.tripsheet_number),
          opening_km:            n(form.opening_km),
          closing_km:            n(form.closing_km),
          manual_opening_time:   s(form.manual_opening_time),
          manual_closing_time:   s(form.manual_closing_time),
          toll_amount:           n(form.toll_amount),
          parking_amount:        n(form.parking_amount),
          permit_amount:         n(form.permit_amount),
          driver_opening_km:     n(form.driver_opening_km),
          driver_closing_km:     n(form.driver_closing_km),
          driver_opening_time:   s(form.driver_opening_time),
          driver_closing_time:   s(form.driver_closing_time),
          driver_toll_amount:    n(form.driver_toll_amount),
          driver_parking_amount: n(form.driver_parking_amount),
          driver_permit_amount:  n(form.driver_permit_amount),
          bata_driver:           n(form.bata_driver),
          client_opening_km:     n(form.client_opening_km),
          client_closing_km:     n(form.client_closing_km),
          client_opening_time:   s(form.client_opening_time),
          client_closing_time:   s(form.client_closing_time),
          client_toll_amount:    n(form.client_toll_amount),
          client_parking_amount: n(form.client_parking_amount),
          client_permit_amount:  n(form.client_permit_amount),
          bata_client:           n(form.bata_client),
          trip_opening_date:     s(form.trip_opening_date),
          trip_closing_date:     s(form.trip_closing_date),
          slab_override:         slabOverride,
        })
        await recalculate()
      } else if (mode === 'driver') {
        await patchSheet({
          driver_opening_km:     n(form.driver_opening_km),
          driver_closing_km:     n(form.driver_closing_km),
          driver_opening_time:   s(form.driver_opening_time),
          driver_closing_time:   s(form.driver_closing_time),
          driver_toll_amount:    n(form.driver_toll_amount),
          driver_parking_amount: n(form.driver_parking_amount),
          driver_permit_amount:  n(form.driver_permit_amount),
          bata_driver:           n(form.bata_driver),
          slab_override:         slabOverride,
        })
        await recalculate()
      } else {
        await patchSheet({
          client_opening_km:     n(form.client_opening_km),
          client_closing_km:     n(form.client_closing_km),
          client_opening_time:   s(form.client_opening_time),
          client_closing_time:   s(form.client_closing_time),
          client_toll_amount:    n(form.client_toll_amount),
          client_parking_amount: n(form.client_parking_amount),
          client_permit_amount:  n(form.client_permit_amount),
          bata_client:           n(form.bata_client),
          trip_opening_date:     s(form.trip_opening_date),
          trip_closing_date:     s(form.trip_closing_date),
          slab_override:         slabOverride,
        })
        await recalculate()
      }
      toast.success(mode === 'driver' ? 'Driver sheet updated' : 'Tripsheet saved')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(null)
    }
  }

  const tripTypeBg: Record<string, string> = {
    local: 'bg-emerald-100 text-emerald-700',
    outstation: 'bg-violet-100 text-violet-700',
    airport: 'bg-amber-100 text-amber-700',
  }

  const TABS: { id: Tab; label: string; color: string; dot: string }[] = [
    { id: 'actual', label: 'Actual',  color: 'text-[#374151]', dot: 'bg-[#6B7280]' },
    { id: 'driver', label: 'Driver',  color: 'text-amber-700',  dot: 'bg-amber-500' },
    { id: 'client', label: 'Client',  color: 'text-blue-700',   dot: 'bg-blue-500'  },
  ]

  const f = form

  // Effective vehicle used for billing: override → driver's actual vehicle → booking's requested vehicle_type.
  // Warn when it has no rate card for this company — this is the exact gap that causes a trip to
  // silently bill at the default rate instead of the client's negotiated rate.
  const effectiveVehicle = billingVehicleType || driverVehicleName || bookingVehicleType
  const vehicleUnrated = !!effectiveVehicle && vehicleTypes.length > 0 &&
    !vehicleTypes.some(v => v.toUpperCase() === effectiveVehicle.toUpperCase())

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-xl gap-0">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="bg-gradient-to-r from-[#1e1b4b] to-[#312e81] px-5 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-white font-bold text-xl tracking-tight">{bookingRef}</span>
              {tripType && (
                <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize', tripTypeBg[tripType] ?? 'bg-white/20 text-white')}>
                  {tripType}
                </span>
              )}
              {f?.tripsheet_number && (
                <span className="text-[11px] font-mono bg-white/15 text-white/90 px-2 py-0.5 rounded">
                  TS#{f.tripsheet_number}
                </span>
              )}
            </div>
            <p className="text-indigo-200 text-xs">Edit tripsheet · verify KM &amp; times before billing</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────── */}
        <div className="flex border-b border-[#E5E7EB] bg-white">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition-colors',
                tab === t.id
                  ? `border-current ${t.color}`
                  : 'border-transparent text-[#9CA3AF] hover:text-[#6B7280]'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', t.dot)} />
              {t.label}
              {t.id !== 'actual' && (
                <span className="text-[10px] text-current opacity-60">adjustment</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 bg-[#FAFAFA]">

          {loading && (
            <div className="py-10 text-center text-sm text-[#9CA3AF]">Loading tripsheet…</div>
          )}
          {!loading && !sheet && (
            <div className="py-10 text-center text-sm text-[#9CA3AF]">No tripsheet found for this booking.</div>
          )}

          {!loading && f && sheet && (
            <>
              {/* ── ACTUAL TAB ─────────────────────────────────── */}
              {tab === 'actual' && (
                <div className="space-y-4">
                  {/* Sheet number */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3">
                    <FieldRow label="Sheet Number" icon={Car}>
                      <Input
                        className="h-8 text-sm"
                        value={f.tripsheet_number}
                        onChange={e => set('tripsheet_number', e.target.value)}
                        placeholder="e.g. TS-2001"
                      />
                    </FieldRow>
                  </div>

                  {/* Billing Slab */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Billing Slab
                      </p>
                      {slabOverride && (
                        <button
                          onClick={() => setSlabOverride(null)}
                          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" /> Reset to auto
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {SLABS.map(sl => {
                        const autoSlab   = detectAutoSlab(tripType, f)
                        const isAuto     = !slabOverride && sl.id === autoSlab
                        const isOverride = slabOverride === sl.id
                        return (
                          <button
                            key={sl.id}
                            onClick={() => setSlabOverride(slabOverride === sl.id ? null : sl.id)}
                            className={cn(
                              'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                              isOverride && 'bg-blue-600 border-blue-600 text-white',
                              isAuto     && 'bg-emerald-600 border-emerald-600 text-white',
                              !isAuto && !isOverride && 'bg-white border-gray-200 text-gray-500 hover:border-gray-400',
                            )}
                          >
                            {sl.label}
                            {isAuto && <span className="ml-1 opacity-75 font-normal text-[10px]">auto</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Vehicle-not-rated warning */}
                  {vehicleUnrated && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        <span className="font-semibold">{effectiveVehicle}</span> has no rate card
                        {companyName ? <> for <span className="font-semibold">{companyName}</span></> : ' for this company'} —
                        billing will fall back to the default rate. Pick a different vehicle to bill as below,
                        or add a {effectiveVehicle} rate on the company&apos;s Rate Cards page.
                      </p>
                    </div>
                  )}

                  {/* Billing vehicle override */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                        <Car className="w-3 h-3" /> Bill as Vehicle
                      </p>
                      {billingVehicleType && (
                        <button
                          onClick={() => setBillingVehicleType(null)}
                          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" /> Reset to auto
                        </button>
                      )}
                    </div>
                    <Select
                      value={billingVehicleType ?? ''}
                      onValueChange={(v: string | null) => { if (v) setBillingVehicleType(v) }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        {billingVehicleType
                          ? <span className="text-blue-700 font-semibold">{billingVehicleType}</span>
                          : <span className="text-gray-400">Auto (driver vehicle)</span>
                        }
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleTypes.map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {groupCompanies.length > 0 && (
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Bill to Company
                        </p>
                        {billingCompanyId && (
                          <button
                            onClick={() => setBillingCompanyId(null)}
                            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
                          >
                            <X className="w-3 h-3" /> Reset
                          </button>
                        )}
                      </div>
                      <Select
                        value={billingCompanyId ?? ''}
                        onValueChange={(v: string | null) => { if (v) setBillingCompanyId(v) }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          {billingCompanyId
                            ? <span className="text-blue-700 font-semibold">{groupCompanies.find(c => c.id === billingCompanyId)?.name ?? '—'}</span>
                            : <span className="text-gray-400">Auto (booking company)</span>
                          }
                        </SelectTrigger>
                        <SelectContent>
                          {groupCompanies.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Outstation dates */}
                  {tripType === 'outstation' && (
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Outstation Dates
                      </p>
                      <div className="grid grid-cols-3 gap-3 items-end">
                        <FieldRow label="Opening Date" icon={Calendar}>
                          <Input type="date" className="h-8 text-sm" value={f.trip_opening_date} onChange={e => set('trip_opening_date', e.target.value)} />
                        </FieldRow>
                        <FieldRow label="Closing Date" icon={Calendar}>
                          <Input type="date" className="h-8 text-sm" value={f.trip_closing_date} onChange={e => set('trip_closing_date', e.target.value)} />
                        </FieldRow>
                        <div className="h-8 flex items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200 text-sm font-bold text-indigo-700">
                          {f.trip_opening_date && f.trip_closing_date
                            ? (() => {
                                const diff = Math.round((new Date(f.trip_closing_date).getTime() - new Date(f.trip_opening_date).getTime()) / 86400000)
                                return diff >= 0 ? `${diff + 1}d` : '—'
                              })()
                            : '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* KM */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                        <Gauge className="w-3 h-3" /> Odometer
                      </p>
                      {kmDiff(f.opening_km, f.closing_km) && (
                        <Chip color="green">{kmDiff(f.opening_km, f.closing_km)}</Chip>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Opening KM" icon={Gauge}>
                        <Input type="number" className="h-8 text-sm" value={f.opening_km} onChange={e => set('opening_km', e.target.value)} placeholder="0" />
                      </FieldRow>
                      <FieldRow label="Closing KM" icon={Gauge}>
                        <Input type="number" className="h-8 text-sm" value={f.closing_km} onChange={e => set('closing_km', e.target.value)} placeholder="0" />
                      </FieldRow>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time
                      </p>
                      {timeDiff(f.manual_opening_time, f.manual_closing_time) && (
                        <Chip color="green">{timeDiff(f.manual_opening_time, f.manual_closing_time)}</Chip>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Opening" icon={Clock}>
                        <Input type="time" className="h-8 text-sm" value={f.manual_opening_time} onChange={e => set('manual_opening_time', e.target.value)} />
                      </FieldRow>
                      <FieldRow label="Closing" icon={Clock}>
                        <Input type="time" className="h-8 text-sm" value={f.manual_closing_time} onChange={e => set('manual_closing_time', e.target.value)} />
                      </FieldRow>
                    </div>
                  </div>

                  {/* Extras */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] flex items-center gap-1">
                      <IndianRupee className="w-3 h-3" /> Extras
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <FieldRow label="Toll" icon={IndianRupee}>
                        <MoneyInput value={f.toll_amount} onChange={v => set('toll_amount', v)} />
                      </FieldRow>
                      <FieldRow label="Parking" icon={IndianRupee}>
                        <MoneyInput value={f.parking_amount} onChange={v => set('parking_amount', v)} />
                      </FieldRow>
                      <FieldRow label="Permit" icon={IndianRupee}>
                        <MoneyInput value={f.permit_amount} onChange={v => set('permit_amount', v)} />
                      </FieldRow>
                    </div>
                  </div>
                </div>
              )}

              {/* ── DRIVER TAB ─────────────────────────────────── */}
              {tab === 'driver' && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    Overrides for driver settlement. Leave blank to use Actual values.
                  </div>

                  {/* KM */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                        <Gauge className="w-3 h-3" /> KM (Driver)
                      </p>
                      {kmDiff(f.driver_opening_km, f.driver_closing_km) && (
                        <Chip color="amber">{kmDiff(f.driver_opening_km, f.driver_closing_km)}</Chip>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Opening KM" icon={Gauge}>
                        <Input type="number" className="h-8 text-sm" value={f.driver_opening_km} onChange={e => set('driver_opening_km', e.target.value)} placeholder="Actual" />
                      </FieldRow>
                      <FieldRow label="Closing KM" icon={Gauge}>
                        <Input type="number" className="h-8 text-sm" value={f.driver_closing_km} onChange={e => set('driver_closing_km', e.target.value)} placeholder="Actual" />
                      </FieldRow>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time (Driver)
                      </p>
                      {timeDiff(f.driver_opening_time, f.driver_closing_time) && (
                        <Chip color="amber">{timeDiff(f.driver_opening_time, f.driver_closing_time)}</Chip>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Opening" icon={Clock}>
                        <Input type="time" className="h-8 text-sm" value={f.driver_opening_time} onChange={e => set('driver_opening_time', e.target.value)} />
                      </FieldRow>
                      <FieldRow label="Closing" icon={Clock}>
                        <Input type="time" className="h-8 text-sm" value={f.driver_closing_time} onChange={e => set('driver_closing_time', e.target.value)} />
                      </FieldRow>
                    </div>
                  </div>

                  {/* Extras + Bata */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                      <IndianRupee className="w-3 h-3" /> Extras &amp; Bata (Driver)
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <FieldRow label="Toll" icon={IndianRupee}>
                        <MoneyInput value={f.driver_toll_amount} onChange={v => set('driver_toll_amount', v)} placeholder="Actual" />
                      </FieldRow>
                      <FieldRow label="Parking" icon={IndianRupee}>
                        <MoneyInput value={f.driver_parking_amount} onChange={v => set('driver_parking_amount', v)} placeholder="Actual" />
                      </FieldRow>
                      <FieldRow label="Permit" icon={IndianRupee}>
                        <MoneyInput value={f.driver_permit_amount} onChange={v => set('driver_permit_amount', v)} placeholder="Actual" />
                      </FieldRow>
                    </div>
                    <div className="pt-1 border-t border-[#F3F4F6]">
                      <FieldRow label="Bata Count" icon={IndianRupee}>
                        <Input type="number" min="0" className="h-8 text-sm max-w-[100px]" value={f.bata_driver} onChange={e => set('bata_driver', e.target.value)} placeholder="0" />
                      </FieldRow>
                    </div>
                  </div>
                </div>
              )}

              {/* ── CLIENT TAB ─────────────────────────────────── */}
              {tab === 'client' && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                    Overrides for invoice calculation. Leave blank to use Actual values.
                  </div>

                  {/* Outstation dates (client) */}
                  {tripType === 'outstation' && (
                    <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Outstation Dates (Client)
                      </p>
                      <div className="grid grid-cols-3 gap-3 items-end">
                        <FieldRow label="Opening Date" icon={Calendar}>
                          <Input type="date" className="h-8 text-sm" value={f.trip_opening_date} onChange={e => set('trip_opening_date', e.target.value)} />
                        </FieldRow>
                        <FieldRow label="Closing Date" icon={Calendar}>
                          <Input type="date" className="h-8 text-sm" value={f.trip_closing_date} onChange={e => set('trip_closing_date', e.target.value)} />
                        </FieldRow>
                        <div className="h-8 flex items-center justify-center rounded-lg bg-blue-50 border border-blue-200 text-sm font-bold text-blue-700">
                          {f.trip_opening_date && f.trip_closing_date
                            ? (() => {
                                const diff = Math.round((new Date(f.trip_closing_date).getTime() - new Date(f.trip_opening_date).getTime()) / 86400000)
                                return diff >= 0 ? `${diff + 1}d` : '—'
                              })()
                            : '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* KM */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
                        <Gauge className="w-3 h-3" /> KM (Client)
                      </p>
                      {kmDiff(f.client_opening_km, f.client_closing_km) && (
                        <Chip color="blue">{kmDiff(f.client_opening_km, f.client_closing_km)}</Chip>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Opening KM" icon={Gauge}>
                        <Input type="number" className="h-8 text-sm" value={f.client_opening_km} onChange={e => set('client_opening_km', e.target.value)} placeholder="Actual" />
                      </FieldRow>
                      <FieldRow label="Closing KM" icon={Gauge}>
                        <Input type="number" className="h-8 text-sm" value={f.client_closing_km} onChange={e => set('client_closing_km', e.target.value)} placeholder="Actual" />
                      </FieldRow>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Time (Client)
                      </p>
                      {timeDiff(f.client_opening_time, f.client_closing_time) && (
                        <Chip color="blue">{timeDiff(f.client_opening_time, f.client_closing_time)}</Chip>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldRow label="Opening" icon={Clock}>
                        <Input type="time" className="h-8 text-sm" value={f.client_opening_time} onChange={e => set('client_opening_time', e.target.value)} />
                      </FieldRow>
                      <FieldRow label="Closing" icon={Clock}>
                        <Input type="time" className="h-8 text-sm" value={f.client_closing_time} onChange={e => set('client_closing_time', e.target.value)} />
                      </FieldRow>
                    </div>
                  </div>

                  {/* Extras + Bata */}
                  <div className="bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1">
                      <IndianRupee className="w-3 h-3" /> Extras &amp; Bata (Client)
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <FieldRow label="Toll" icon={IndianRupee}>
                        <MoneyInput value={f.client_toll_amount} onChange={v => set('client_toll_amount', v)} placeholder="Actual" />
                      </FieldRow>
                      <FieldRow label="Parking" icon={IndianRupee}>
                        <MoneyInput value={f.client_parking_amount} onChange={v => set('client_parking_amount', v)} placeholder="Actual" />
                      </FieldRow>
                      <FieldRow label="Permit" icon={IndianRupee}>
                        <MoneyInput value={f.client_permit_amount} onChange={v => set('client_permit_amount', v)} placeholder="Actual" />
                      </FieldRow>
                    </div>
                    <div className="pt-1 border-t border-[#F3F4F6]">
                      <FieldRow label="Bata Count (billed)" icon={IndianRupee}>
                        <Input type="number" min="0" className="h-8 text-sm max-w-[100px]" value={f.bata_client} onChange={e => set('bata_client', e.target.value)} placeholder="0" />
                      </FieldRow>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        {!loading && sheet && f && (
          <div className="px-5 py-3.5 bg-white border-t border-[#E5E7EB] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => handleSave('both')}
                disabled={saving !== null}
                className="bg-[#312e81] hover:bg-[#1e1b4b] text-white gap-1.5 rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                {saving === 'both' ? 'Saving…' : 'Save Both'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSave('driver')}
                disabled={saving !== null}
                className="border-amber-300 text-amber-700 hover:bg-amber-50 gap-1 rounded-lg"
              >
                {saving === 'driver' ? 'Saving…' : 'Driver only'}
                <ChevronRight className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSave('client')}
                disabled={saving !== null}
                className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1 rounded-lg"
              >
                {saving === 'client' ? 'Saving…' : 'Client only'}
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
            <button
              onClick={onClose}
              disabled={saving !== null}
              className="text-xs text-[#9CA3AF] hover:text-[#374151] transition-colors shrink-0"
            >
              Cancel
            </button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  )
}
