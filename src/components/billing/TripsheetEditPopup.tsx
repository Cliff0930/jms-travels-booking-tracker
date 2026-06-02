'use client'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

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

function nn(v: number | null | undefined): string { return v != null ? String(v) : '' }
function ns(v: string | null | undefined): string { return v ?? '' }

export function TripsheetEditPopup({ bookingId, tripSheetId, bookingRef, tripType, invoiceId, lineItemId, onClose, onSaved }: Props) {
  const [sheet, setSheet] = useState<TripSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<SaveMode | null>(null)
  const [form, setForm] = useState<Form | null>(null)

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/trip-sheet`)
      .then(r => r.json())
      .then((sheets: TripSheet[]) => {
        const s = sheets.find(x => x.id === tripSheetId) ?? sheets[0] ?? null
        setSheet(s)
        if (s) {
          setForm({
            tripsheet_number:    ns(s.tripsheet_number),
            opening_km:          nn(s.opening_km),
            closing_km:          nn(s.closing_km),
            manual_opening_time: ns(s.manual_opening_time),
            manual_closing_time: ns(s.manual_closing_time),
            toll_amount:         nn(s.toll_amount),
            parking_amount:      nn(s.parking_amount),
            permit_amount:       nn(s.permit_amount),
            driver_opening_km:   nn(s.driver_opening_km  ?? s.opening_km),
            driver_closing_km:   nn(s.driver_closing_km  ?? s.closing_km),
            driver_opening_time: ns(s.driver_opening_time  ?? s.manual_opening_time),
            driver_closing_time: ns(s.driver_closing_time  ?? s.manual_closing_time),
            driver_toll_amount:   nn(s.driver_toll_amount),
            driver_parking_amount: nn(s.driver_parking_amount),
            driver_permit_amount:  nn(s.driver_permit_amount),
            bata_driver:         nn(s.bata_driver) || '0',
            client_opening_km:   nn(s.client_opening_km  ?? s.opening_km),
            client_closing_km:   nn(s.client_closing_km  ?? s.closing_km),
            client_opening_time: ns(s.client_opening_time  ?? s.manual_opening_time),
            client_closing_time: ns(s.client_closing_time  ?? s.manual_closing_time),
            client_toll_amount:   nn(s.client_toll_amount),
            client_parking_amount: nn(s.client_parking_amount),
            client_permit_amount:  nn(s.client_permit_amount),
            bata_client:         nn(s.bata_client) || '0',
            trip_opening_date:   ns(s.trip_opening_date),
            trip_closing_date:   ns(s.trip_closing_date),
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [bookingId, tripSheetId])

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
        })
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
        })
        await recalculate()
      }
      toast.success(mode === 'driver' ? 'Driver tripsheet updated' : 'Tripsheet saved — invoice recalculated')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setSaving(null)
    }
  }

  function set(key: keyof Form, val: string) {
    setForm(prev => prev ? { ...prev, [key]: val } : prev)
  }

  const f = form

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tripsheet — {bookingRef}{tripType === 'outstation' ? ' (Outstation)' : ''}</DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center text-sm text-gray-400">Loading tripsheet…</div>}
        {!loading && !sheet && <div className="py-8 text-center text-sm text-gray-400">No tripsheet found for this booking.</div>}

        {!loading && f && sheet && (
          <div className="space-y-6 py-1">

            {/* ── ACTUAL ───────────────────────────────────────────── */}
            <div className="rounded-lg border border-gray-200 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Actual <span className="font-normal normal-case text-gray-400">(base values — used when no driver/client override)</span></p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Sheet No.</Label>
                  <Input className="h-8 text-sm" value={f.tripsheet_number} onChange={e => set('tripsheet_number', e.target.value)} placeholder="e.g. 2001" />
                </div>
                {/* Outstation date fields */}
                {tripType === 'outstation' && (<>
                  <div className="space-y-1">
                    <Label className="text-xs">Opening Date</Label>
                    <Input type="date" className="h-8 text-sm" value={f.trip_opening_date} onChange={e => set('trip_opening_date', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Closing Date</Label>
                    <Input type="date" className="h-8 text-sm" value={f.trip_closing_date} onChange={e => set('trip_closing_date', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Days</Label>
                    <div className="h-8 px-3 flex items-center text-sm font-semibold text-blue-700 bg-blue-50 rounded-md border border-blue-200">
                      {f.trip_opening_date && f.trip_closing_date
                        ? (() => {
                            const diff = Math.round((new Date(f.trip_closing_date).getTime() - new Date(f.trip_opening_date).getTime()) / 86400000)
                            return diff >= 0 ? `${diff + 1} day${diff + 1 !== 1 ? 's' : ''}` : '—'
                          })()
                        : '—'}
                    </div>
                  </div>
                </>)}
                <div className="space-y-1">
                  <Label className="text-xs">Opening KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.opening_km} onChange={e => set('opening_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.closing_km} onChange={e => set('closing_km', e.target.value)} placeholder="0" />
                </div>
                <div />
                <div className="space-y-1">
                  <Label className="text-xs">Opening Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.manual_opening_time} onChange={e => set('manual_opening_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.manual_closing_time} onChange={e => set('manual_closing_time', e.target.value)} />
                </div>
                <div />
                <div className="space-y-1">
                  <Label className="text-xs">Toll (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.toll_amount} onChange={e => set('toll_amount', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Parking (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.parking_amount} onChange={e => set('parking_amount', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Permit (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.permit_amount} onChange={e => set('permit_amount', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* ── DRIVER ───────────────────────────────────────────── */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Driver Adjustment <span className="font-normal normal-case text-amber-600">(driver settlement — blank = use Actual)</span></p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Opening KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_opening_km} onChange={e => set('driver_opening_km', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_closing_km} onChange={e => set('driver_closing_km', e.target.value)} placeholder="Actual" />
                </div>
                <div />
                <div className="space-y-1">
                  <Label className="text-xs">Opening Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.driver_opening_time} onChange={e => set('driver_opening_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.driver_closing_time} onChange={e => set('driver_closing_time', e.target.value)} />
                </div>
                <div />
                <div className="space-y-1">
                  <Label className="text-xs">Toll (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_toll_amount} onChange={e => set('driver_toll_amount', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Parking (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_parking_amount} onChange={e => set('driver_parking_amount', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Permit (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_permit_amount} onChange={e => set('driver_permit_amount', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bata Count</Label>
                  <Input type="number" min="0" className="h-8 text-sm" value={f.bata_driver} onChange={e => set('bata_driver', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* ── CLIENT ───────────────────────────────────────────── */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Client Adjustment <span className="font-normal normal-case text-blue-600">(invoice calculation — blank = use Actual)</span></p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Opening KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_opening_km} onChange={e => set('client_opening_km', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_closing_km} onChange={e => set('client_closing_km', e.target.value)} placeholder="Actual" />
                </div>
                <div />
                <div className="space-y-1">
                  <Label className="text-xs">Opening Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.client_opening_time} onChange={e => set('client_opening_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.client_closing_time} onChange={e => set('client_closing_time', e.target.value)} />
                </div>
                <div />
                <div className="space-y-1">
                  <Label className="text-xs">Toll (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_toll_amount} onChange={e => set('client_toll_amount', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Parking (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_parking_amount} onChange={e => set('client_parking_amount', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Permit (₹)</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_permit_amount} onChange={e => set('client_permit_amount', e.target.value)} placeholder="Actual" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bata Count <span className="text-gray-400 font-normal">(billed)</span></Label>
                  <Input type="number" min="0" className="h-8 text-sm" value={f.bata_client} onChange={e => set('bata_client', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* ── ACTIONS ──────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => handleSave('both')} disabled={saving !== null} className="bg-blue-700 hover:bg-blue-800 text-white">
                {saving === 'both' ? 'Saving…' : 'Save Both'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSave('driver')} disabled={saving !== null} className="border-amber-300 text-amber-800 hover:bg-amber-50">
                {saving === 'driver' ? 'Saving…' : 'Save Driver Only'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleSave('client')} disabled={saving !== null} className="border-blue-300 text-blue-800 hover:bg-blue-50">
                {saving === 'client' ? 'Saving…' : 'Save Client Only'}
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose} disabled={saving !== null} className="ml-auto">
                Cancel
              </Button>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
