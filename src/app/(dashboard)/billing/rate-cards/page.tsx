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

function ClientRateModal({ companies, onClose, onSaved }: {
  companies: { id: string; name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    company_id: '', vehicle_type: '', package_4hr_rate: '', package_8hr_rate: '',
    extra_km_rate: '14', extra_hr_rate: '250', outstation_rate_per_km: '',
    outstation_min_kms_per_day: '300', tds_percent: '0',
    local_bata_rate: '', outstation_bata_rate: '',
    bill_bata_to_client: false, special_notes: '', effective_from: new Date().toISOString().slice(0, 10),
  })
  const [saving, setSaving] = useState(false)

  const { data: driversForModal = [] } = useQuery<{ id: string; vehicle_name: string }[]>({ queryKey: ['drivers-for-rates'], queryFn: () => fetch('/api/drivers').then(r => r.json()) })
  const uniqueVehicleNames = useMemo(() => [...new Set(driversForModal.filter(d => d.vehicle_name).map(d => d.vehicle_name))].sort(), [driversForModal])

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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Client Rate Override</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Company *</Label>
              <Select value={form.company_id} onValueChange={(v: string | null) => setForm(f => ({ ...f, company_id: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle Type *</Label>
              <Select value={form.vehicle_type} onValueChange={(v: string | null) => setForm(f => ({ ...f, vehicle_type: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>{uniqueVehicleNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(['package_4hr_rate', 'package_8hr_rate', 'extra_km_rate', 'extra_hr_rate', 'outstation_rate_per_km', 'outstation_min_kms_per_day', 'tds_percent'] as const).map(field => (
              <div key={field} className="space-y-1">
                <Label className="text-xs">{({ package_4hr_rate: '4hr Package (₹)', package_8hr_rate: '8hr Package (₹)', extra_km_rate: 'Extra KM Rate', extra_hr_rate: 'Extra Hour Rate', outstation_rate_per_km: 'Outstation/km', outstation_min_kms_per_day: 'Min KMs/day', tds_percent: 'TDS %' } as Record<string, string>)[field]}</Label>
                <Input className="h-8 text-sm" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} type="number" />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Effective From</Label>
              <Input className="h-8 text-sm" type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="bill_bata" checked={form.bill_bata_to_client} onChange={e => setForm(f => ({ ...f, bill_bata_to_client: e.target.checked }))} />
            <Label htmlFor="bill_bata" className="text-sm">Bill bata to this client</Label>
          </div>
          {form.bill_bata_to_client && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Local Bata Rate (₹/bata day)</Label>
                <Input className="h-8 text-sm" type="number" value={form.local_bata_rate} onChange={e => setForm(f => ({ ...f, local_bata_rate: e.target.value }))} placeholder="e.g. 500" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Outstation Bata Rate (₹/bata day)</Label>
                <Input className="h-8 text-sm" type="number" value={form.outstation_bata_rate} onChange={e => setForm(f => ({ ...f, outstation_bata_rate: e.target.value }))} placeholder="e.g. 750" />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Special Notes</Label>
            <Input className="h-8 text-sm" value={form.special_notes} onChange={e => setForm(f => ({ ...f, special_notes: e.target.value }))} placeholder="e.g. No minimum KMs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add Rate'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Quick "Add Rate" for a driver vehicle that has no rate card yet
function AddRateButton({ vehicleName, vehicleCategory, onSaved }: { vehicleName: string; vehicleCategory: string; onSaved: () => void }) {
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

function DriverRateModal({ companies, vehicles, onClose, onSaved }: {
  companies: { id: string; name: string }[]
  vehicles: { vehicle_name: string }[]
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
        <DialogHeader><DialogTitle>Add Driver Rate Override</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500 -mt-2">What JMS pays the driver for trips from this company. Overrides commission% in Driver Settlement.</p>
        <div className="py-2 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Company *</Label>
              <Select value={form.company_id} onValueChange={(v: string | null) => setForm(f => ({ ...f, company_id: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle Type *</Label>
              <Select value={form.vehicle_type} onValueChange={(v: string | null) => setForm(f => ({ ...f, vehicle_type: v ?? '' }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>{vehicles.map(v => <SelectItem key={v.vehicle_name} value={v.vehicle_name}>{v.vehicle_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="4hr/40km — Driver gets" field="rate_4hr" />
            <F label="8hr/80km — Driver gets" field="rate_8hr" />
            <F label="Extra KM rate (/km)" field="extra_km_rate" />
            <F label="Extra Hour rate (/hr)" field="extra_hr_rate" />
            <F label="Outstation (/km)" field="outstation_rate_per_km" />
            <F label="Local Bata/day" field="bata_per_day" />
            <F label="Outstation Bata/day" field="outstation_bata_per_day" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Driver Rate'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function RateCardsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'default' | 'client' | 'driver'>('default')
  const [categoryFilter, setCategoryFilter] = useState('All')
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
  // Fetch drivers to build the live vehicle list (vehicle_name + vehicle_type)
  const { data: drivers = [] } = useQuery<{ id: string; vehicle_name: string; vehicle_type: string; is_active: boolean }[]>({
    queryKey: ['drivers-for-rates'],
    queryFn: () => fetch('/api/drivers').then(r => r.json()),
  })

  // Build unique vehicle list from active drivers, merged with existing rate card data
  const rateMap = useMemo(() => {
    const m: Record<string, RateCard> = {}
    for (const r of rates) m[r.vehicle_type.toUpperCase()] = r
    return m
  }, [rates])

  const driverVehicles = useMemo(() => {
    const seen = new Map<string, { vehicle_name: string; vehicle_type: string }>()
    for (const d of drivers) {
      if (d.vehicle_name && !seen.has(d.vehicle_name.toUpperCase())) {
        seen.set(d.vehicle_name.toUpperCase(), { vehicle_name: d.vehicle_name, vehicle_type: d.vehicle_type })
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.vehicle_name.localeCompare(b.vehicle_name))
  }, [drivers])

  // For the category filter, use driver vehicle_type values
  const driverCategories = useMemo(() => {
    const cats = new Set(driverVehicles.map(v => v.vehicle_type))
    return ['All', ...Array.from(cats).sort()]
  }, [driverVehicles])

  const filteredVehicles = useMemo(() => {
    return categoryFilter === 'All'
      ? driverVehicles
      : driverVehicles.filter(v => v.vehicle_type === categoryFilter)
  }, [driverVehicles, categoryFilter])

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
          {/* Category filter — built from driver vehicle types */}
          <div className="flex flex-wrap gap-2">
            {driverCategories.map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  categoryFilter === c ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300')}
              >{c}</button>
            ))}
          </div>

          {driverVehicles.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
              No drivers added yet. Add drivers first — their vehicle types will appear here automatically.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Vehicle Name', 'Type (from Driver)', '4hr/40km', '8hr/80km', 'Extra KM', 'Extra Hr', 'Outn/km', 'Min KM', 'L.Bata', 'O.Bata', ''].map(h => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredVehicles.map(v => {
                    const r = rateMap[v.vehicle_name.toUpperCase()]
                    return (
                      <tr key={v.vehicle_name} className={cn('hover:bg-gray-50', !r && 'bg-amber-50')}>
                        <td className="px-3 py-2.5 font-semibold text-gray-900 whitespace-nowrap">{v.vehicle_name}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{v.vehicle_type}</span>
                        </td>
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
                              <AddRateButton vehicleName={v.vehicle_name} vehicleCategory={v.vehicle_type} onSaved={() => qc.invalidateQueries({ queryKey: ['rate-cards'] })} />
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
          <p className="text-xs text-gray-400">Vehicle list is synced live from your driver profiles. Add a driver → their vehicle appears here automatically.</p>
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
      {showClientModal && <ClientRateModal companies={companies} onClose={() => setShowClientModal(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['client-rate-cards'] }); setShowClientModal(false) }} />}
      {showDriverModal && <DriverRateModal companies={companies} vehicles={driverVehicles} onClose={() => setShowDriverModal(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ['driver-rate-cards'] }); setShowDriverModal(false) }} />}
    </div>
  )
}
