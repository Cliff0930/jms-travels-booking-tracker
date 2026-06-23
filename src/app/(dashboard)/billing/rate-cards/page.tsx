'use client'
import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Pencil, Plus, IndianRupee } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RateCard {
  id: string; vehicle_type: string; category: string
  package_4hr_rate: number; package_8hr_rate: number
  extra_km_rate: number; extra_hr_rate: number
  outstation_rate_per_km: number; outstation_min_kms_per_day: number
  local_bata: number; outstation_bata_per_day: number
  is_active: boolean; sort_order: number
}

interface ClientRateCard {
  id: string; company_id: string; vehicle_type: string
  package_4hr_rate: number | null; package_8hr_rate: number | null
  extra_km_rate: number | null; extra_hr_rate: number | null
  outstation_rate_per_km: number | null; outstation_min_kms_per_day: number | null
  bill_bata_to_client: boolean; tds_percent: number
  local_bata_rate: number | null; outstation_bata_rate: number | null
  special_notes: string | null; effective_from: string; is_active: boolean
  company?: { name: string }
}

interface DriverRateCard {
  id: string; company_id: string; vehicle_type: string
  rate_4hr: number | null; rate_8hr: number | null
  extra_km_rate: number | null; extra_hr_rate: number | null
  outstation_rate_per_km: number | null
  bata_per_day: number | null; outstation_bata_per_day: number | null
  is_active: boolean; created_at: string
  company?: { name: string }
}


function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return '₹' + Number(n).toLocaleString('en-IN')
}

function RateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-500">{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
        <Input className="pl-6 h-8 text-sm" value={value} onChange={e => onChange(e.target.value)} type="number" />
      </div>
    </div>
  )
}

function RateEditModal({ rate, onClose, onSaved }: { rate: RateCard; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    package_4hr_rate: String(rate.package_4hr_rate),
    package_8hr_rate: String(rate.package_8hr_rate),
    extra_km_rate: String(rate.extra_km_rate),
    extra_hr_rate: String(rate.extra_hr_rate),
    outstation_rate_per_km: String(rate.outstation_rate_per_km),
    outstation_min_kms_per_day: String(rate.outstation_min_kms_per_day),
    local_bata: String(rate.local_bata),
    outstation_bata_per_day: String(rate.outstation_bata_per_day),
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) || 0]))
    const res = await fetch(`/api/billing/rate-cards/${rate.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (res.ok) { toast.success('Rate updated'); onSaved() }
    else toast.error('Failed to save')
    setSaving(false)
  }

  const F = ({ label, field }: { label: string; field: keyof typeof form }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
        <Input className="pl-6 h-8 text-sm" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} type="number" />
      </div>
    </div>
  )

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Rates — {rate.vehicle_type}</DialogTitle></DialogHeader>
        <div className="py-2 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <F label="4hr/40km Package" field="package_4hr_rate" />
            <F label="8hr/80km Package" field="package_8hr_rate" />
            <F label="Extra KM Rate (per km)" field="extra_km_rate" />
            <F label="Extra Hour Rate (per hr)" field="extra_hr_rate" />
            <F label="Outstation Rate (per km)" field="outstation_rate_per_km" />
            <div className="space-y-1">
              <Label className="text-xs">Outstation Min KMs/day</Label>
              <Input className="h-8 text-sm" value={form.outstation_min_kms_per_day} onChange={e => setForm(f => ({ ...f, outstation_min_kms_per_day: e.target.value }))} type="number" />
            </div>
            <F label="Local Bata (per trip)" field="local_bata" />
            <F label="Outstation Bata (per day)" field="outstation_bata_per_day" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Rates'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ClientRateModal({ companies, vehicleNames, onClose, onSaved }: {
  companies: { id: string; name: string }[]; vehicleNames: { id: string; name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    company_id: '', vehicle_type: '', package_4hr_rate: '', package_8hr_rate: '',
    extra_km_rate: '14', extra_hr_rate: '250', outstation_rate_per_km: '',
    outstation_min_kms_per_day: '300', tds_percent: '0',
    local_bata_rate: '', outstation_bata_rate: '',
    bill_bata_to_client: false, special_notes: '', effective_from: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.company_id || !form.vehicle_type) { toast.error('Select company and vehicle type'); return }
    setSaving(true)
    const body = {
      company_id: form.company_id, vehicle_type: form.vehicle_type,
      package_4hr_rate: form.package_4hr_rate ? Number(form.package_4hr_rate) : null,
      package_8hr_rate: form.package_8hr_rate ? Number(form.package_8hr_rate) : null,
      extra_km_rate: form.extra_km_rate ? Number(form.extra_km_rate) : null,
      extra_hr_rate: form.extra_hr_rate ? Number(form.extra_hr_rate) : null,
      outstation_rate_per_km: form.outstation_rate_per_km ? Number(form.outstation_rate_per_km) : null,
      outstation_min_kms_per_day: form.outstation_min_kms_per_day ? Number(form.outstation_min_kms_per_day) : null,
      tds_percent: Number(form.tds_percent),
      local_bata_rate: form.local_bata_rate ? Number(form.local_bata_rate) : null,
      outstation_bata_rate: form.outstation_bata_rate ? Number(form.outstation_bata_rate) : null,
      bill_bata_to_client: form.bill_bata_to_client,
      special_notes: form.special_notes || null,
      effective_from: form.effective_from,
    }
    const res = await fetch('/api/billing/client-rate-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { toast.success('Client rate added'); onSaved() }
    else toast.error('Failed to save')
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 shrink-0">
              <IndianRupee className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Add Client Rate Override</DialogTitle>
              <p className="text-xs text-gray-400 mt-0.5">Custom billing rates for a specific company &amp; vehicle</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Company & Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Company *</Label>
              <Select value={form.company_id} onValueChange={(v: string | null) => setForm(f => ({ ...f, company_id: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm w-full">
                  {form.company_id
                    ? <span>{companies.find(c => c.id === form.company_id)?.name}</span>
                    : <span className="text-muted-foreground text-sm">Select company</span>
                  }
                </SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vehicle Type *</Label>
              <Select value={form.vehicle_type} onValueChange={(v: string | null) => setForm(f => ({ ...f, vehicle_type: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm w-full">
                  {form.vehicle_type
                    ? <span>{form.vehicle_type}</span>
                    : <span className="text-muted-foreground text-sm">Select vehicle</span>
                  }
                </SelectTrigger>
                <SelectContent>{vehicleNames.map(v => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Local Rates */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Local Rates</p>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-blue-50/60 border border-blue-100 p-3">
              <RateField label="4hr / 40km Package" value={form.package_4hr_rate} onChange={v => setForm(f => ({ ...f, package_4hr_rate: v }))} />
              <RateField label="8hr / 80km Package" value={form.package_8hr_rate} onChange={v => setForm(f => ({ ...f, package_8hr_rate: v }))} />
              <RateField label="Extra KM Rate (/km)" value={form.extra_km_rate} onChange={v => setForm(f => ({ ...f, extra_km_rate: v }))} />
              <RateField label="Extra Hour Rate (/hr)" value={form.extra_hr_rate} onChange={v => setForm(f => ({ ...f, extra_hr_rate: v }))} />
            </div>
          </div>

          {/* Outstation Rates */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Outstation Rates</p>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50/60 border border-amber-100 p-3">
              <RateField label="Rate per KM" value={form.outstation_rate_per_km} onChange={v => setForm(f => ({ ...f, outstation_rate_per_km: v }))} />
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Min KMs / day</Label>
                <Input className="h-8 text-sm" value={form.outstation_min_kms_per_day} onChange={e => setForm(f => ({ ...f, outstation_min_kms_per_day: e.target.value }))} type="number" />
              </div>
            </div>
          </div>

          {/* Billing Settings */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Billing Settings</p>
            <div className="space-y-3 rounded-lg bg-gray-50 border border-gray-100 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">TDS %</Label>
                  <Input className="h-8 text-sm" value={form.tds_percent} onChange={e => setForm(f => ({ ...f, tds_percent: e.target.value }))} type="number" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-500">Effective From</Label>
                  <Input className="h-8 text-sm" type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} />
                </div>
              </div>
              <label htmlFor="bill_bata" className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2">
                <input type="checkbox" id="bill_bata" className="h-4 w-4 rounded" checked={form.bill_bata_to_client} onChange={e => setForm(f => ({ ...f, bill_bata_to_client: e.target.checked }))} />
                <span className="text-sm text-gray-700">Bill bata to this client</span>
              </label>
              {form.bill_bata_to_client && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Local Bata Rate (₹/day)</Label>
                    <Input className="h-8 text-sm" type="number" value={form.local_bata_rate} onChange={e => setForm(f => ({ ...f, local_bata_rate: e.target.value }))} placeholder="e.g. 500" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Outstation Bata Rate (₹/day)</Label>
                    <Input className="h-8 text-sm" type="number" value={form.outstation_bata_rate} onChange={e => setForm(f => ({ ...f, outstation_bata_rate: e.target.value }))} placeholder="e.g. 750" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Special Notes */}
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Special Notes</Label>
            <Input className="h-8 text-sm" value={form.special_notes} onChange={e => setForm(f => ({ ...f, special_notes: e.target.value }))} placeholder="e.g. No minimum KMs for this client" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? 'Saving…' : <><Plus className="w-3.5 h-3.5" />Add Rate Override</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Quick "Add Rate" for a driver vehicle that has no rate card yet
function AddRateButton({ vehicleName, vehicleCategory = '', onSaved }: { vehicleName: string; vehicleCategory?: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    package_4hr_rate: '900', package_8hr_rate: '1900',
    extra_km_rate: '14', extra_hr_rate: '250',
    outstation_rate_per_km: '14', outstation_min_kms_per_day: '300',
    local_bata: '300', outstation_bata_per_day: '450',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const body = {
      vehicle_type: vehicleName,
      category: vehicleCategory,
      ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, Number(v) || 0])),
    }
    const res = await fetch('/api/billing/rate-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { toast.success(`Rate added for ${vehicleName}`); onSaved(); setOpen(false) }
    else toast.error('Failed to save')
    setSaving(false)
  }

  const F = ({ label, field }: { label: string; field: keyof typeof form }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
        <Input className="pl-6 h-8 text-sm" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} type="number" />
      </div>
    </div>
  )

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap flex items-center gap-1">
        <Plus className="w-3 h-3" />Add Rate
      </button>
      {open && (
        <Dialog open onOpenChange={o => { if (!o) setOpen(false) }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Rate — {vehicleName} ({vehicleCategory})</DialogTitle></DialogHeader>
            <div className="py-2 grid grid-cols-2 gap-3">
              <F label="4hr/40km Package" field="package_4hr_rate" />
              <F label="8hr/80km Package" field="package_8hr_rate" />
              <F label="Extra KM Rate (/km)" field="extra_km_rate" />
              <F label="Extra Hour Rate (/hr)" field="extra_hr_rate" />
              <F label="Outstation Rate (/km)" field="outstation_rate_per_km" />
              <div className="space-y-1">
                <Label className="text-xs">Min KMs/day (Outstation)</Label>
                <Input className="h-8 text-sm" value={form.outstation_min_kms_per_day} onChange={e => setForm(f => ({ ...f, outstation_min_kms_per_day: e.target.value }))} type="number" />
              </div>
              <F label="Local Bata (/trip)" field="local_bata" />
              <F label="Outstation Bata (/day)" field="outstation_bata_per_day" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Rate'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function DriverRateModal({ companies, vehicleNames, onClose, onSaved }: {
  companies: { id: string; name: string }[]
  vehicleNames: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    company_id: '', vehicle_type: '',
    rate_4hr: '', rate_8hr: '', extra_km_rate: '', extra_hr_rate: '',
    outstation_rate_per_km: '', bata_per_day: '', outstation_bata_per_day: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.company_id || !form.vehicle_type) { toast.error('Select company and vehicle type'); return }
    setSaving(true)
    const body = {
      company_id:             form.company_id,
      vehicle_type:           form.vehicle_type,
      rate_4hr:               form.rate_4hr               ? Number(form.rate_4hr)               : null,
      rate_8hr:               form.rate_8hr               ? Number(form.rate_8hr)               : null,
      extra_km_rate:          form.extra_km_rate          ? Number(form.extra_km_rate)          : null,
      extra_hr_rate:          form.extra_hr_rate          ? Number(form.extra_hr_rate)          : null,
      outstation_rate_per_km:  form.outstation_rate_per_km  ? Number(form.outstation_rate_per_km)  : null,
      bata_per_day:            form.bata_per_day            ? Number(form.bata_per_day)            : null,
      outstation_bata_per_day: form.outstation_bata_per_day ? Number(form.outstation_bata_per_day) : null,
    }
    const res = await fetch('/api/billing/driver-rate-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) { toast.success('Driver rate saved'); onSaved() }
    else toast.error('Failed to save')
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 p-2 shrink-0">
              <IndianRupee className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Add Driver Rate Override</DialogTitle>
              <p className="text-xs text-gray-400 mt-0.5">What JMS pays the driver for trips from this company. Overrides commission% in Driver Settlement.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Company & Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Company *</Label>
              <Select value={form.company_id} onValueChange={(v: string | null) => setForm(f => ({ ...f, company_id: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm w-full">
                  {form.company_id
                    ? <span>{companies.find(c => c.id === form.company_id)?.name}</span>
                    : <span className="text-muted-foreground text-sm">Select company</span>
                  }
                </SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Vehicle Type *</Label>
              <Select value={form.vehicle_type} onValueChange={(v: string | null) => setForm(f => ({ ...f, vehicle_type: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm w-full">
                  {form.vehicle_type
                    ? <span>{form.vehicle_type}</span>
                    : <span className="text-muted-foreground text-sm">Select vehicle</span>
                  }
                </SelectTrigger>
                <SelectContent>{vehicleNames.map(v => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Local Rates */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Local Rates</p>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-blue-50/60 border border-blue-100 p-3">
              <RateField label="4hr / 40km — Driver gets" value={form.rate_4hr} onChange={v => setForm(f => ({ ...f, rate_4hr: v }))} />
              <RateField label="8hr / 80km — Driver gets" value={form.rate_8hr} onChange={v => setForm(f => ({ ...f, rate_8hr: v }))} />
              <RateField label="Extra KM Rate (/km)" value={form.extra_km_rate} onChange={v => setForm(f => ({ ...f, extra_km_rate: v }))} />
              <RateField label="Extra Hour Rate (/hr)" value={form.extra_hr_rate} onChange={v => setForm(f => ({ ...f, extra_hr_rate: v }))} />
            </div>
          </div>

          {/* Outstation & Bata */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Outstation &amp; Bata</p>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-amber-50/60 border border-amber-100 p-3">
              <RateField label="Outstation Rate (/km)" value={form.outstation_rate_per_km} onChange={v => setForm(f => ({ ...f, outstation_rate_per_km: v }))} />
              <div />
              <RateField label="Local Bata / day" value={form.bata_per_day} onChange={v => setForm(f => ({ ...f, bata_per_day: v }))} />
              <RateField label="Outstation Bata / day" value={form.outstation_bata_per_day} onChange={v => setForm(f => ({ ...f, outstation_bata_per_day: v }))} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? 'Saving…' : <><Plus className="w-3.5 h-3.5" />Save Driver Rate</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function RateCardsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'default' | 'client' | 'driver'>('default')
  const [editingRate, setEditingRate] = useState<RateCard | null>(null)
  const [showClientModal, setShowClientModal] = useState(false)
  const [showDriverModal, setShowDriverModal] = useState(false)

  const { data: rates = [] } = useQuery<RateCard[]>({
    queryKey: ['rate-cards'],
    queryFn: () => fetch('/api/billing/rate-cards').then(r => r.json()),
  })
  const { data: clientRates = [] } = useQuery<ClientRateCard[]>({
    queryKey: ['client-rate-cards'],
    queryFn: () => fetch('/api/billing/client-rate-cards').then(r => r.json()),
  })
  const { data: driverRates = [] } = useQuery<DriverRateCard[]>({
    queryKey: ['driver-rate-cards'],
    queryFn: () => fetch('/api/billing/driver-rate-cards').then(r => r.json()),
  })
  const { data: companies = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['companies-list'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
  })
  const { data: vehicleNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['vehicle-names'],
    queryFn: () => fetch('/api/vehicle-names').then(r => r.json()),
  })

  const rateMap = useMemo(() => {
    const m: Record<string, RateCard> = {}
    for (const r of rates) m[r.vehicle_type.toUpperCase()] = r
    return m
  }, [rates])

  async function deleteClientRate(id: string) {
    if (!confirm('Remove this client rate override?')) return
    await fetch(`/api/billing/client-rate-cards/${id}`, { method: 'DELETE' })
    toast.success('Removed'); qc.invalidateQueries({ queryKey: ['client-rate-cards'] })
  }

  async function deleteDriverRate(id: string) {
    if (!confirm('Remove this driver rate override?')) return
    await fetch(`/api/billing/driver-rate-cards/${id}`, { method: 'DELETE' })
    toast.success('Removed'); qc.invalidateQueries({ queryKey: ['driver-rate-cards'] })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rate Cards"
        description="Default vehicle rates, client billing overrides, and driver pay overrides"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowClientModal(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />Client Override
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDriverModal(true)} className="gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50">
              <Plus className="w-3.5 h-3.5" />Driver Override
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['default', 'client', 'driver'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 text-sm font-semibold capitalize border-b-2 transition-colors',
              tab === t ? 'border-blue-700 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >{t === 'default' ? 'Default Rates' : t === 'client' ? 'Client Overrides' : 'Driver Overrides'}</button>
        ))}
      </div>

      {tab === 'default' && (
        <>
          {vehicleNames.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
              No vehicle names yet. Go to Settings → Vehicle Names to add your vehicle types.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Vehicle Name', '4hr/40km', '8hr/80km', 'Extra KM', 'Extra Hr', 'Outn/km', 'Min KM', 'L.Bata', 'O.Bata', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {vehicleNames.map(v => {
                    const r = rateMap[v.name.toUpperCase()]
                    return (
                      <tr key={v.id} className={cn('hover:bg-gray-50', !r && 'bg-amber-50')}>
                        <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{v.name}</td>
                        {r ? (
                          <>
                            <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.package_4hr_rate)}</td>
                            <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.package_8hr_rate)}</td>
                            <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.extra_km_rate)}/km</td>
                            <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.extra_hr_rate)}/hr</td>
                            <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.outstation_rate_per_km)}/km</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.outstation_min_kms_per_day} km</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmt(r.local_bata)}</td>
                            <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{fmt(r.outstation_bata_per_day)}/day</td>
                            <td className="px-3 py-2.5">
                              <button onClick={() => setEditingRate(r)} className="text-blue-600 hover:text-blue-800">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td colSpan={8} className="px-3 py-2.5 text-amber-600 text-xs italic">No rate set — click Add Rate to configure</td>
                            <td className="px-3 py-2.5">
                              <AddRateButton vehicleName={v.name} onSaved={() => qc.invalidateQueries({ queryKey: ['rate-cards'] })} />
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-400">Vehicle list is synced from Settings → Vehicle Names. Add vehicles there and they appear here automatically.</p>
        </>
      )}

      {tab === 'client' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {clientRates.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No client rate overrides yet. Click "Client Override" to add one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Company', 'Vehicle Type', '4hr', '8hr', 'Extra KM', 'Outn/km', 'TDS%', 'Bill Bata', 'Local Bata', 'Outn Bata', 'Effective From', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientRates.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{r.company?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.vehicle_type}</td>
                    <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.package_4hr_rate)}</td>
                    <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{fmt(r.package_8hr_rate)}</td>
                    <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{r.extra_km_rate ? `₹${r.extra_km_rate}/km` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-800 whitespace-nowrap">{r.outstation_rate_per_km ? `₹${r.outstation_rate_per_km}/km` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.tds_percent}%</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', r.bill_bata_to_client ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {r.bill_bata_to_client ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.local_bata_rate ? `₹${r.local_bata_rate}` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.outstation_bata_rate ? `₹${r.outstation_bata_rate}` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{r.effective_from}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => deleteClientRate(r.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'driver' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {driverRates.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No driver rate overrides yet. Click "Driver Override" to add one.<br /><span className="text-xs">These rates override commission% in Driver Settlement for trips from specific companies.</span></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-indigo-50 border-b border-indigo-100">
                <tr>
                  {['Company', 'Vehicle', '4hr Pay', '8hr Pay', 'Extra KM', 'Extra Hr', 'Outn/km', 'Local Bata', 'Outn Bata', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-indigo-600 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {driverRates.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">{r.company?.name ?? '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.vehicle_type}</td>
                    <td className="px-3 py-2.5 font-semibold text-indigo-700 whitespace-nowrap">{r.rate_4hr ? `₹${r.rate_4hr}` : '—'}</td>
                    <td className="px-3 py-2.5 font-semibold text-indigo-700 whitespace-nowrap">{r.rate_8hr ? `₹${r.rate_8hr}` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.extra_km_rate ? `₹${r.extra_km_rate}/km` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.extra_hr_rate ? `₹${r.extra_hr_rate}/hr` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.outstation_rate_per_km ? `₹${r.outstation_rate_per_km}/km` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.bata_per_day ? `₹${r.bata_per_day}/day` : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">{r.outstation_bata_per_day ? `₹${r.outstation_bata_per_day}/day` : '—'}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => deleteDriverRate(r.id)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {editingRate && <RateEditModal rate={editingRate} onClose={() => setEditingRate(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['rate-cards'] }); setEditingRate(null) }} />}
      {showClientModal && <ClientRateModal companies={companies} vehicleNames={vehicleNames} onClose={() => setShowClientModal(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['client-rate-cards'] }); setShowClientModal(false) }} />}
      {showDriverModal && <DriverRateModal companies={companies} vehicleNames={vehicleNames} onClose={() => setShowDriverModal(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['driver-rate-cards'] }); setShowDriverModal(false) }} />}
    </div>
  )
}
