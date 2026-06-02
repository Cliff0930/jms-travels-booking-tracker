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
  toll_amount: number | null
  parking_amount: number | null
  permit_amount: number | null
  bata_driver: number | null
  bata_client: number | null
  driver_opening_km: number | null
  driver_closing_km: number | null
  driver_opening_time: string | null
  driver_closing_time: string | null
  client_opening_km: number | null
  client_closing_km: number | null
  client_opening_time: string | null
  client_closing_time: string | null
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

export function TripsheetEditPopup({ bookingId, tripSheetId, bookingRef, tripType, invoiceId, lineItemId, onClose, onSaved }: Props) {
  const [sheet, setSheet] = useState<TripSheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<SaveMode | null>(null)
  const [form, setForm] = useState<{
    tripsheet_number: string
    opening_km: string; closing_km: string
    manual_opening_time: string; manual_closing_time: string
    toll_amount: string; parking_amount: string; permit_amount: string
    bata_driver: string; bata_client: string
    driver_opening_km: string; driver_closing_km: string
    driver_opening_time: string; driver_closing_time: string
    client_opening_km: string; client_closing_km: string
    client_opening_time: string; client_closing_time: string
  } | null>(null)

  useEffect(() => {
    fetch(`/api/bookings/${bookingId}/trip-sheet`)
      .then(r => r.json())
      .then((sheets: TripSheet[]) => {
        const s = sheets.find(x => x.id === tripSheetId) ?? sheets[0] ?? null
        setSheet(s)
        if (s) {
          setForm({
            tripsheet_number:    s.tripsheet_number    ?? '',
            opening_km:          s.opening_km          != null ? String(s.opening_km)    : '',
            closing_km:          s.closing_km          != null ? String(s.closing_km)    : '',
            manual_opening_time: s.manual_opening_time ?? '',
            manual_closing_time: s.manual_closing_time ?? '',
            toll_amount:         s.toll_amount         != null ? String(s.toll_amount)   : '',
            parking_amount:      s.parking_amount      != null ? String(s.parking_amount): '',
            permit_amount:       s.permit_amount       != null ? String(s.permit_amount) : '',
            bata_driver:         s.bata_driver         != null ? String(s.bata_driver)   : '0',
            bata_client:         s.bata_client         != null ? String(s.bata_client)   : '0',
            driver_opening_km:   String(s.driver_opening_km  ?? s.opening_km  ?? ''),
            driver_closing_km:   String(s.driver_closing_km  ?? s.closing_km  ?? ''),
            driver_opening_time: s.driver_opening_time  ?? s.manual_opening_time ?? '',
            driver_closing_time: s.driver_closing_time  ?? s.manual_closing_time ?? '',
            client_opening_km:   String(s.client_opening_km  ?? s.opening_km  ?? ''),
            client_closing_km:   String(s.client_closing_km  ?? s.closing_km  ?? ''),
            client_opening_time: s.client_opening_time  ?? s.manual_opening_time ?? '',
            client_closing_time: s.client_closing_time  ?? s.manual_closing_time ?? '',
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
          tripsheet_number:    s(form.tripsheet_number),
          opening_km:          n(form.opening_km),
          closing_km:          n(form.closing_km),
          manual_opening_time: s(form.manual_opening_time),
          manual_closing_time: s(form.manual_closing_time),
          toll_amount:         n(form.toll_amount),
          parking_amount:      n(form.parking_amount),
          permit_amount:       n(form.permit_amount),
          bata_driver:         n(form.bata_driver),
          bata_client:         n(form.bata_client),
          driver_opening_km:   n(form.driver_opening_km),
          driver_closing_km:   n(form.driver_closing_km),
          driver_opening_time: s(form.driver_opening_time),
          driver_closing_time: s(form.driver_closing_time),
          client_opening_km:   n(form.client_opening_km),
          client_closing_km:   n(form.client_closing_km),
          client_opening_time: s(form.client_opening_time),
          client_closing_time: s(form.client_closing_time),
        })
        await recalculate()
      } else if (mode === 'driver') {
        await patchSheet({
          driver_opening_km:   n(form.driver_opening_km),
          driver_closing_km:   n(form.driver_closing_km),
          driver_opening_time: s(form.driver_opening_time),
          driver_closing_time: s(form.driver_closing_time),
        })
      } else {
        await patchSheet({
          client_opening_km:   n(form.client_opening_km),
          client_closing_km:   n(form.client_closing_km),
          client_opening_time: s(form.client_opening_time),
          client_closing_time: s(form.client_closing_time),
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

  const f = form
  function set(key: keyof NonNullable<typeof form>, val: string) {
    setForm(prev => prev ? { ...prev, [key]: val } : prev)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tripsheet — {bookingRef}{tripType === 'outstation' ? ' (Outstation)' : ''}</DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center text-sm text-gray-400">Loading tripsheet…</div>}
        {!loading && !sheet && <div className="py-8 text-center text-sm text-gray-400">No tripsheet found for this booking.</div>}

        {!loading && f && sheet && (
          <div className="space-y-5 py-1">
            {/* Actual */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Actual</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Sheet No.</Label>
                  <Input className="h-8 text-sm" value={f.tripsheet_number} onChange={e => set('tripsheet_number', e.target.value)} placeholder="e.g. 2001" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Opening KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.opening_km} onChange={e => set('opening_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.closing_km} onChange={e => set('closing_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Opening Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.manual_opening_time} onChange={e => set('manual_opening_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.manual_closing_time} onChange={e => set('manual_closing_time', e.target.value)} />
                </div>
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
                <div className="space-y-1">
                  <Label className="text-xs">Bata — Driver</Label>
                  <Input type="number" min="0" className="h-8 text-sm" value={f.bata_driver} onChange={e => set('bata_driver', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bata — Client <span className="text-gray-400 font-normal">(billed)</span></Label>
                  <Input type="number" min="0" className="h-8 text-sm" value={f.bata_client} onChange={e => set('bata_client', e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Driver Adjustment */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Driver Adjustment <span className="text-amber-600 font-normal normal-case">(driver settlement)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Opening KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_opening_km} onChange={e => set('driver_opening_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.driver_closing_km} onChange={e => set('driver_closing_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Opening Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.driver_opening_time} onChange={e => set('driver_opening_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.driver_closing_time} onChange={e => set('driver_closing_time', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Client Adjustment */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-900">Client Adjustment <span className="text-blue-600 font-normal normal-case">(invoice calculation)</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Opening KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_opening_km} onChange={e => set('client_opening_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing KM</Label>
                  <Input type="number" className="h-8 text-sm" value={f.client_closing_km} onChange={e => set('client_closing_km', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Opening Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.client_opening_time} onChange={e => set('client_opening_time', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Closing Time</Label>
                  <Input type="time" className="h-8 text-sm" value={f.client_closing_time} onChange={e => set('client_closing_time', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t pt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleSave('both')}
                disabled={saving !== null}
                className="bg-blue-700 hover:bg-blue-800 text-white"
              >
                {saving === 'both' ? 'Saving…' : 'Save Both'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSave('driver')}
                disabled={saving !== null}
                className="border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                {saving === 'driver' ? 'Saving…' : 'Save Driver Only'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSave('client')}
                disabled={saving !== null}
                className="border-blue-300 text-blue-800 hover:bg-blue-50"
              >
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
