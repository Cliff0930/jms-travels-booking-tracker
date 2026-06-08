'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { CompanyCombobox } from '@/components/shared/CompanyCombobox'
import { GuestSearchCombobox } from '@/components/shared/GuestSearchCombobox'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { MapPin, Calendar, Car, Users, ArrowLeft, Building2, User, FileText, CheckCircle, Gauge } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/date'
import type { Client, Company, Driver } from '@/types'
import { useRef } from 'react'

const VEHICLE_TYPES = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface DaySheet {
  tripsheet_number: string
  opening_km: string
  closing_km: string
  manual_opening_time: string
  manual_closing_time: string
  toll_amount: string
  parking_amount: string
  permit_amount: string
  bata_driver: string
  bata_client: string
}

const emptyDaySheet = (): DaySheet => ({
  tripsheet_number: '', opening_km: '', closing_km: '',
  manual_opening_time: '', manual_closing_time: '',
  toll_amount: '', parking_amount: '', permit_amount: '',
  bata_driver: '', bata_client: '',
})

interface FormState {
  booking_type: 'company' | 'personal'
  client_id: string
  company_id: string
  guest_name: string
  guest_phone: string
  driver_id: string
  trip_type: 'local' | 'outstation' | 'airport'
  service_type: 'one_way' | 'return'
  total_days: string
  end_date: string
  pickup_location: string
  drop_location: string
  pickup_date: string
  pickup_time: string
  vehicle_type: string
  pax_count: string
  special_instructions: string
  // Single-day tripsheet (used when total_days=1 or outstation)
  tripsheet_number: string
  opening_km: string
  closing_km: string
  manual_opening_time: string
  manual_closing_time: string
  toll_amount: string
  parking_amount: string
  permit_amount: string
  bata_driver: string
  bata_client: string
  // Multi-day local tripsheets (used when total_days>1 and trip_type=local)
  day_sheets: DaySheet[]
}

function SectionHeader({ n, icon: Icon, title }: { n: number; icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-6 h-6 rounded-full bg-[#7E3AF2] flex items-center justify-center text-[11px] font-bold text-white shrink-0">{n}</div>
      <Icon className="w-4 h-4 text-[#737686]" />
      <h2 className="text-sm font-semibold text-[#191B23] uppercase tracking-wide">{title}</h2>
    </div>
  )
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 h-8 rounded-lg text-xs font-medium border transition-all',
        active
          ? 'bg-[#7E3AF2] text-white border-[#7E3AF2] shadow-sm'
          : 'bg-white text-[#434654] border-[#C3C5D7] hover:border-[#7E3AF2] hover:text-[#7E3AF2]',
      )}
    >
      {children}
    </button>
  )
}

// Inline client search combobox (same pattern as new booking page)
function ClientSearchCombobox({
  clients, companies, value, onChange,
}: {
  clients: Client[]
  companies: Company[]
  value: string
  onChange: (clientId: string, companyId?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = clients.find(c => c.id === value)

  useEffect(() => { if (selected) setQuery('') }, [selected])
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = query.trim().length === 0 ? [] : clients.filter(c => {
    const q = query.toLowerCase()
    const co = (c.company as { name?: string } | null)?.name?.toLowerCase() ?? ''
    return c.name.toLowerCase().includes(q) || (c.primary_phone ?? '').includes(q) || co.includes(q)
  }).slice(0, 20)

  return (
    <div ref={containerRef} className="relative">
      {selected && !open ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-[#C3C5D7] bg-white text-sm">
          <span className="flex-1 truncate text-[#191B23] font-medium">{selected.name}</span>
          <button type="button" onClick={() => onChange('', undefined)} className="text-[#9CA3AF] hover:text-[#191B23]">✕</button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          placeholder={selected ? selected.name : 'Search by name, phone or company…'}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="w-full h-9 px-3 rounded-md border border-[#C3C5D7] bg-white text-sm text-[#191B23] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#7E3AF2] focus:border-transparent"
        />
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(c.id, c.company_id ?? undefined); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2.5 hover:bg-[#EDE9FE] transition-colors border-b border-[#F3F4F6] last:border-0"
            >
              <div className="text-sm font-medium text-[#191B23]">{c.name}</div>
              <div className="flex gap-2 mt-0.5">
                {(c.company as { name?: string } | null)?.name && <span className="text-xs text-[#7E3AF2]">{(c.company as { name?: string }).name}</span>}
                {c.primary_phone && <span className="text-xs text-[#737686]">{c.primary_phone}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function OfflineTripPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromBookingId = searchParams.get('from')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState<FormState>({
    booking_type: 'company',
    client_id: '', company_id: '',
    guest_name: '', guest_phone: '',
    driver_id: '',
    trip_type: 'local', service_type: 'one_way', total_days: '1', end_date: '',
    pickup_location: '', drop_location: '',
    pickup_date: '', pickup_time: '',
    vehicle_type: '', pax_count: '',
    special_instructions: '',
    tripsheet_number: '',
    opening_km: '', closing_km: '',
    manual_opening_time: '', manual_closing_time: '',
    toll_amount: '', parking_amount: '', permit_amount: '',
    bata_driver: '', bata_client: '',
    day_sheets: [],
  })

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => fetch('/api/clients').then(r => r.json()),
  })
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
  })
  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['drivers'],
    queryFn: () => fetch('/api/drivers').then(r => r.json()),
  })

  // Pre-fill from ?from=bookingId
  useEffect(() => {
    if (!fromBookingId) return
    fetch(`/api/bookings/${fromBookingId}`)
      .then(r => r.json())
      .then(b => {
        if (!b?.id) return
        setForm(f => ({
          ...f,
          booking_type: b.booking_type ?? 'company',
          client_id:    b.client_id ?? '',
          company_id:   b.company_id ?? '',
          guest_name:   b.guest_name ?? '',
          guest_phone:  b.guest_phone ?? '',
          driver_id:    b.driver_id ?? '',
          trip_type:    b.trip_type ?? 'local',
          service_type: b.service_type ?? 'one_way',
          total_days:   String(b.total_days ?? 1),
          pickup_location:      b.pickup_location ?? '',
          drop_location:        b.drop_location ?? '',
          pickup_date:          b.pickup_date ?? '',
          pickup_time:          b.pickup_time ?? '',
          vehicle_type:         b.vehicle_type ?? '',
          pax_count:            b.pax_count ? String(b.pax_count) : '',
          special_instructions: b.special_instructions ?? '',
        }))
      })
      .catch(() => {})
  }, [fromBookingId])

  // Sync day_sheets array length when total_days or trip_type changes
  useEffect(() => {
    const days = parseInt(form.total_days) || 1
    const isMultiLocal = days > 1 && form.trip_type === 'local'
    if (!isMultiLocal) return
    setForm(f => {
      const current = f.day_sheets
      if (current.length === days) return f
      const updated = Array.from({ length: days }, (_, i) => current[i] ?? emptyDaySheet())
      return { ...f, day_sheets: updated }
    })
  }, [form.total_days, form.trip_type])

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function handleTotalDaysChange(val: string) {
    setForm(f => {
      const days = parseInt(val)
      const endDate = (days >= 1 && f.pickup_date)
        ? (() => { const d = new Date(f.pickup_date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days - 1); return d.toISOString().slice(0, 10) })()
        : ''
      return { ...f, total_days: val, end_date: endDate }
    })
  }

  function handleEndDateChange(val: string) {
    setForm(f => {
      if (!val || !f.pickup_date) return { ...f, end_date: val }
      const diff = Math.round((new Date(val + 'T00:00:00Z').getTime() - new Date(f.pickup_date + 'T00:00:00Z').getTime()) / 86400000) + 1
      return { ...f, end_date: val, total_days: diff >= 1 ? String(diff) : f.total_days }
    })
  }

  function handlePickupDateChange(val: string) {
    setForm(f => {
      const days = parseInt(f.total_days) || 1
      const endDate = val
        ? (() => { const d = new Date(val + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days - 1); return d.toISOString().slice(0, 10) })()
        : ''
      return { ...f, pickup_date: val, end_date: endDate }
    })
  }

  function setDaySheetField(dayIdx: number, key: keyof DaySheet, val: string) {
    setForm(f => {
      const updated = f.day_sheets.map((s, i) => i === dayIdx ? { ...s, [key]: val } : s)
      return { ...f, day_sheets: updated }
    })
  }

  const isMultiLocal = (parseInt(form.total_days) || 1) > 1 && form.trip_type === 'local'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.pickup_location.trim()) { setError('Pickup location is required'); return }
    if (!form.pickup_date)            { setError('Trip date is required'); return }

    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        booking_type:         form.booking_type,
        client_id:            form.client_id   || null,
        company_id:           form.company_id  || null,
        guest_name:           form.guest_name  || null,
        guest_phone:          form.guest_phone || null,
        driver_id:            form.driver_id   || null,
        pickup_location:      form.pickup_location,
        drop_location:        form.drop_location || null,
        pickup_date:          form.pickup_date,
        pickup_time:          form.pickup_time || null,
        pax_count:            form.pax_count   || null,
        vehicle_type:         form.vehicle_type || null,
        trip_type:            form.trip_type,
        service_type:         form.service_type,
        total_days:           form.total_days  || '1',
        special_instructions: form.special_instructions || null,
      }

      if (isMultiLocal && form.day_sheets.length > 0) {
        body.day_sheets = form.day_sheets
      } else {
        body.tripsheet_number    = form.tripsheet_number || null
        body.opening_km          = form.opening_km       || null
        body.closing_km          = form.closing_km       || null
        body.manual_opening_time = form.manual_opening_time || null
        body.manual_closing_time = form.manual_closing_time || null
        body.toll_amount         = form.toll_amount       || null
        body.parking_amount      = form.parking_amount    || null
        body.permit_amount       = form.permit_amount     || null
        body.bata_driver         = form.bata_driver       || null
        body.bata_client         = form.bata_client       || null
      }

      const res = await fetch('/api/bookings/offline-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Offline trip ${json.booking_ref} created`)
      router.push(`/bookings/${json.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedDriver  = drivers.find(d => d.id === form.driver_id)
  const selectedClient  = clients.find(c => c.id === form.client_id)
  const selectedCompany = companies.find(c => c.id === form.company_id)
  const isReady = !!(form.pickup_location && form.pickup_date)

  const summaryItems = [
    { label: 'Client',  value: selectedClient?.name || form.guest_name || null },
    { label: 'Company', value: selectedCompany?.name || null },
    { label: 'Driver',  value: selectedDriver ? `${selectedDriver.name} · ${selectedDriver.vehicle_number}` : null },
    { label: 'Pickup',  value: form.pickup_location || null },
    { label: 'Drop',    value: form.drop_location   || null },
    { label: 'Date',    value: form.pickup_date ? formatDate(form.pickup_date) : null },
    { label: 'Time',    value: form.pickup_time || null },
    { label: 'Vehicle', value: form.vehicle_type || null },
    { label: 'Sheet #', value: form.tripsheet_number || null },
    { label: 'KM',      value: (form.opening_km && form.closing_km) ? `${form.opening_km} → ${form.closing_km} (${Number(form.closing_km) - Number(form.opening_km)} km)` : null },
  ].filter(i => i.value)

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-[#434654] hover:text-[#191B23] -ml-1 py-1.5 px-2 rounded hover:bg-[#EDEDF8] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Bookings
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#191B23]">
          {fromBookingId ? 'Duplicate as Offline Trip' : 'Add Offline Trip'}
        </h1>
        <p className="text-sm text-[#737686] mt-0.5">
          {fromBookingId
            ? 'Pre-filled from existing booking — edit any field and save as a new entry'
            : 'Record a trip that happened outside the system — links to billing & driver settlement'}
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left: Form ─────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Section 1: Booking Type */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={1} icon={Building2} title="Booking Type" />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setField('booking_type', 'company')}
                  className={cn(
                    'flex-1 h-10 rounded-lg text-sm font-medium border-2 transition-all flex items-center justify-center gap-2',
                    form.booking_type === 'company'
                      ? 'border-[#7E3AF2] bg-[#EDE9FE] text-[#7E3AF2]'
                      : 'border-[#C3C5D7] text-[#434654] hover:border-[#7E3AF2]/50'
                  )}
                >
                  <Building2 className="w-4 h-4" /> Company
                </button>
                <button
                  type="button"
                  onClick={() => setField('booking_type', 'personal')}
                  className={cn(
                    'flex-1 h-10 rounded-lg text-sm font-medium border-2 transition-all flex items-center justify-center gap-2',
                    form.booking_type === 'personal'
                      ? 'border-[#7E3AF2] bg-[#EDE9FE] text-[#7E3AF2]'
                      : 'border-[#C3C5D7] text-[#434654] hover:border-[#7E3AF2]/50'
                  )}
                >
                  <User className="w-4 h-4" /> Personal
                </button>
              </div>
            </div>

            {/* Section 2: Client & Driver */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={2} icon={User} title="Client &amp; Driver" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Client</Label>
                  <ClientSearchCombobox
                    clients={clients}
                    companies={companies}
                    value={form.client_id}
                    onChange={(clientId, companyId) => {
                      setField('client_id', clientId)
                      if (companyId && !form.company_id) setField('company_id', companyId)
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Company</Label>
                  <CompanyCombobox
                    value={form.company_id}
                    companies={companies}
                    onChange={id => setField('company_id', id)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Guest Name <span className="text-[#9CA3AF]">(if different)</span></Label>
                  <GuestSearchCombobox
                    companyId={form.company_id || null}
                    value={form.guest_name}
                    onChange={name => setField('guest_name', name)}
                    onSelect={(name, phone) => {
                      setField('guest_name', name)
                      if (phone) setField('guest_phone', phone)
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Guest Phone</Label>
                  <Input
                    value={form.guest_phone}
                    onChange={e => setField('guest_phone', e.target.value)}
                    placeholder="91XXXXXXXXXX"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs text-[#737686] mb-1.5 block">Driver <span className="text-[#9CA3AF]">(for settlement)</span></Label>
                  <Select value={form.driver_id} onValueChange={v => v !== null && setField('driver_id', v)}>
                    <SelectTrigger className="border-[#C3C5D7] h-9">
                      <SelectValue placeholder="Select driver…" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} · {d.vehicle_number} · {d.vehicle_type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 3: Trip Details */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={3} icon={MapPin} title="Trip Details" />

              <div className="mb-4">
                <Label className="text-xs text-[#737686] mb-2 block">Trip Type</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['local', 'outstation', 'airport'] as const).map(t => (
                    <PillButton key={t} active={form.trip_type === t} onClick={() => setField('trip_type', t)}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#7E3AF2]" />
                    Pickup Location <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.pickup_location}
                    onChange={e => setField('pickup_location', e.target.value)}
                    placeholder="Full pickup address"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#737686]" />
                    Drop Location
                  </Label>
                  <Input
                    value={form.drop_location}
                    onChange={e => setField('drop_location', e.target.value)}
                    placeholder="Drop address"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.pickup_date}
                    onChange={e => handlePickupDateChange(e.target.value)}
                    type="date"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Time</Label>
                  <Input
                    value={form.pickup_time}
                    onChange={e => setField('pickup_time', e.target.value)}
                    type="time"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Total Days</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={form.total_days}
                      onChange={e => handleTotalDaysChange(e.target.value)}
                      type="number"
                      min="1"
                      placeholder="Days"
                      className="border-[#C3C5D7] h-9 w-16 shrink-0"
                    />
                    <span className="text-[10px] text-[#9CA3AF] shrink-0">or end</span>
                    <Input
                      value={form.end_date}
                      onChange={e => handleEndDateChange(e.target.value)}
                      type="date"
                      min={form.pickup_date || undefined}
                      disabled={!form.pickup_date}
                      className="border-[#C3C5D7] h-9 flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Service</Label>
                  <Select value={form.service_type} onValueChange={v => v !== null && setField('service_type', v as 'one_way' | 'return')}>
                    <SelectTrigger className="border-[#C3C5D7] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_way">One Way</SelectItem>
                      <SelectItem value="return">Return</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vehicle */}
              <div className="mb-4">
                <Label className="text-xs text-[#737686] mb-2 block">Vehicle Type</Label>
                <div className="flex gap-2 flex-wrap">
                  {VEHICLE_TYPES.map(v => (
                    <PillButton key={v} active={form.vehicle_type === v} onClick={() => setField('vehicle_type', form.vehicle_type === v ? '' : v)}>
                      {v}
                    </PillButton>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Passengers
                  </Label>
                  <Input
                    value={form.pax_count}
                    onChange={e => setField('pax_count', e.target.value)}
                    type="number"
                    min="1"
                    placeholder="e.g. 2"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Tripsheet Data */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={4} icon={Gauge} title="Tripsheet Data" />
              <p className="text-xs text-[#737686] mb-4">
                {isMultiLocal
                  ? `Enter tripsheet details for each of the ${form.total_days} days.`
                  : 'Enter the details from the physical tripsheet received from the driver.'}
              </p>

              {/* ── Multi-day local: per-day cards ── */}
              {isMultiLocal ? (
                <div className="space-y-4">
                  {form.day_sheets.map((sheet, i) => {
                    const legDate = form.pickup_date
                      ? new Date(new Date(form.pickup_date + 'T00:00:00').getTime() + i * 86400000)
                          .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      : null
                    return (
                      <div key={i} className="border border-[#E5E7EB] rounded-lg p-4 bg-[#F9F9FF]">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="w-5 h-5 rounded-full bg-[#7E3AF2] text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-xs font-semibold text-[#7E3AF2]">Day {i + 1}{legDate ? ` · ${legDate}` : ''}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="col-span-2 sm:col-span-1">
                            <Label className="text-xs text-[#737686] mb-1 block">Tripsheet #</Label>
                            <Input value={sheet.tripsheet_number} onChange={e => setDaySheetField(i, 'tripsheet_number', e.target.value)} placeholder="e.g. 2001" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Opening KM</Label>
                            <Input value={sheet.opening_km} onChange={e => setDaySheetField(i, 'opening_km', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Closing KM</Label>
                            <Input value={sheet.closing_km} onChange={e => setDaySheetField(i, 'closing_km', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Opening Time</Label>
                            <Input value={sheet.manual_opening_time} onChange={e => setDaySheetField(i, 'manual_opening_time', e.target.value)} type="time" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Closing Time</Label>
                            <Input value={sheet.manual_closing_time} onChange={e => setDaySheetField(i, 'manual_closing_time', e.target.value)} type="time" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Toll (₹)</Label>
                            <Input value={sheet.toll_amount} onChange={e => setDaySheetField(i, 'toll_amount', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Parking (₹)</Label>
                            <Input value={sheet.parking_amount} onChange={e => setDaySheetField(i, 'parking_amount', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Permit (₹)</Label>
                            <Input value={sheet.permit_amount} onChange={e => setDaySheetField(i, 'permit_amount', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Bata Driver</Label>
                            <Input value={sheet.bata_driver} onChange={e => setDaySheetField(i, 'bata_driver', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs text-[#737686] mb-1 block">Bata Client</Label>
                            <Input value={sheet.bata_client} onChange={e => setDaySheetField(i, 'bata_client', e.target.value)} type="number" placeholder="0" className="border-[#C3C5D7] h-8 text-sm" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs text-[#737686] mb-1.5 block">Tripsheet Number</Label>
                  <Input
                    value={form.tripsheet_number}
                    onChange={e => setField('tripsheet_number', e.target.value)}
                    placeholder="e.g. TS-001"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" /> Opening KM
                  </Label>
                  <Input
                    value={form.opening_km}
                    onChange={e => setField('opening_km', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="e.g. 45200"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" /> Closing KM
                  </Label>
                  <Input
                    value={form.closing_km}
                    onChange={e => setField('closing_km', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="e.g. 45340"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Opening Time</Label>
                  <Input
                    value={form.manual_opening_time}
                    onChange={e => setField('manual_opening_time', e.target.value)}
                    type="time"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Closing Time</Label>
                  <Input
                    value={form.manual_closing_time}
                    onChange={e => setField('manual_closing_time', e.target.value)}
                    type="time"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Toll (₹)</Label>
                  <Input
                    value={form.toll_amount}
                    onChange={e => setField('toll_amount', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Parking (₹)</Label>
                  <Input
                    value={form.parking_amount}
                    onChange={e => setField('parking_amount', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Permit (₹)</Label>
                  <Input
                    value={form.permit_amount}
                    onChange={e => setField('permit_amount', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Bata — Driver</Label>
                  <Input
                    value={form.bata_driver}
                    onChange={e => setField('bata_driver', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Bata — Client</Label>
                  <Input
                    value={form.bata_client}
                    onChange={e => setField('bata_client', e.target.value)}
                    type="number"
                    min="0"
                    placeholder="0"
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>
              </>
              )}
            </div>

            {/* Section 5: Notes */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={5} icon={FileText} title="Notes" />
              <Textarea
                value={form.special_instructions}
                onChange={e => setField('special_instructions', e.target.value)}
                placeholder="Any additional notes…"
                rows={3}
                className="border-[#C3C5D7] resize-none text-sm"
              />
            </div>
          </div>

          {/* ── Right: Summary ──────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 bg-white rounded-xl border border-[#E5E7EB] p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-[#EDE9FE] text-[#7E3AF2]">Offline Trip</span>
                <h3 className="text-sm font-semibold text-[#191B23]">Summary</h3>
              </div>

              {summaryItems.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] mb-4">Fill in the form to see a preview here.</p>
              ) : (
                <dl className="space-y-2.5 mb-5">
                  {summaryItems.map(item => (
                    <div key={item.label} className="flex justify-between gap-2">
                      <dt className="text-xs text-[#737686] shrink-0">{item.label}</dt>
                      <dd className="text-xs font-medium text-[#191B23] text-right truncate max-w-[60%]">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {isReady && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 mb-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  Required fields complete
                </div>
              )}

              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full bg-[#7E3AF2] hover:bg-[#6C2BD9] rounded-lg"
                  disabled={submitting || !isReady}
                  onClick={handleSubmit}
                >
                  {submitting ? 'Saving…' : 'Save Offline Trip'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-lg"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              </div>

              <p className="text-[11px] text-[#9CA3AF] mt-4 text-center">
                Saved as Completed · appears in Billing &amp; Driver Settlement
              </p>
            </div>
          </div>

        </div>
      </form>
    </div>
  )
}

export default function OfflineTripPage() {
  return (
    <Suspense>
      <OfflineTripPageInner />
    </Suspense>
  )
}
