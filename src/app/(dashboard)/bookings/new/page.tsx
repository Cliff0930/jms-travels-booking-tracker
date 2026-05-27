'use client'
import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCreateBooking } from '@/hooks/useBookings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { MapPin, Calendar, Clock, Users, Car, ArrowLeft, Building2, User, FileText, CheckCircle, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/date'
import type { Client, Company } from '@/types'
import { Suspense } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreateClient } from '@/hooks/useClients'
import { CompanyCombobox } from '@/components/shared/CompanyCombobox'
import { GuestSearchCombobox } from '@/components/shared/GuestSearchCombobox'

const VEHICLE_TYPES = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface FormState {
  booking_type: 'company' | 'personal'
  client_id: string
  company_id: string
  guest_name: string
  guest_phone: string
  trip_type: 'local' | 'outstation' | 'airport'
  service_type: 'one_way' | 'return'
  total_days: string
  pickup_location: string
  drop_location: string
  pickup_date: string
  pickup_time: string
  vehicle_type: string
  pax_count: string
  special_instructions: string
}

function SectionHeader({ n, icon: Icon, title }: { n: number; icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-6 h-6 rounded-full bg-[#1A56DB] flex items-center justify-center text-[11px] font-bold text-white shrink-0">{n}</div>
      <Icon className="w-4 h-4 text-[#737686]" />
      <h2 className="text-sm font-semibold text-[#191B23] uppercase tracking-wide">{title}</h2>
    </div>
  )
}

function PillButton({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 h-8 rounded-lg text-xs font-medium border transition-all',
        active
          ? 'bg-[#1A56DB] text-white border-[#1A56DB] shadow-sm'
          : 'bg-white text-[#434654] border-[#C3C5D7] hover:border-[#1A56DB] hover:text-[#1A56DB]',
        className
      )}
    >
      {children}
    </button>
  )
}

function ClientSearchCombobox({
  clients,
  companies,
  value,
  onChange,
  onCreateNew,
}: {
  clients: Client[]
  companies: import('@/types').Company[]
  value: string
  onChange: (clientId: string, companyId?: string) => void
  onCreateNew?: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = clients.find(c => c.id === value)

  useEffect(() => {
    if (selected) setQuery('')
  }, [selected])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = query.trim().length === 0 ? [] : clients.filter(c => {
    const q = query.toLowerCase()
    const companyName = (c.company as { name?: string } | null)?.name?.toLowerCase() ?? ''
    return (
      c.name.toLowerCase().includes(q) ||
      (c.primary_phone ?? '').toLowerCase().includes(q) ||
      (c.primary_email ?? '').toLowerCase().includes(q) ||
      companyName.includes(q)
    )
  }).slice(0, 20)

  function handleSelect(c: Client) {
    onChange(c.id, c.company_id ?? undefined)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onChange('', undefined)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      {selected && !open ? (
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-[#C3C5D7] bg-white text-sm">
          <span className="flex-1 truncate text-[#191B23] font-medium">{selected.name}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-[#9CA3AF] hover:text-[#191B23] shrink-0 leading-none"
            aria-label="Clear client"
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          placeholder={selected ? selected.name : 'Search by name, phone, email or company…'}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="w-full h-9 px-3 rounded-md border border-[#C3C5D7] bg-white text-sm text-[#191B23] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A56DB] focus:border-transparent"
        />
      )}

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.map(c => {
            const companyName = (c.company as { name?: string } | null)?.name
            return (
              <button
                key={c.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(c)}
                className="w-full text-left px-3 py-2.5 hover:bg-[#EEF2FF] transition-colors border-b border-[#F3F4F6] last:border-0"
              >
                <div className="text-sm font-medium text-[#191B23]">{c.name}</div>
                <div className="flex gap-2 mt-0.5">
                  {companyName && <span className="text-xs text-[#1A56DB]">{companyName}</span>}
                  {c.primary_phone && <span className="text-xs text-[#737686]">{c.primary_phone}</span>}
                  {c.primary_email && !c.primary_phone && <span className="text-xs text-[#737686]">{c.primary_email}</span>}
                </div>
              </button>
            )
          })}
          {onCreateNew && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setOpen(false); onCreateNew() }}
              className="w-full text-left px-3 py-2.5 hover:bg-[#F0FDF4] transition-colors flex items-center gap-2 border-t border-[#E5E7EB] bg-white sticky bottom-0"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#1A56DB] shrink-0" />
              <span className="text-sm font-medium text-[#1A56DB]">+ New client</span>
            </button>
          )}
        </div>
      )}

      {open && query.trim().length > 0 && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-[#E5E7EB] rounded-lg shadow-lg overflow-hidden">
          <p className="px-3 py-3 text-sm text-[#9CA3AF]">No clients found for &ldquo;{query}&rdquo;</p>
          {onCreateNew && (
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setOpen(false); onCreateNew() }}
              className="w-full text-left px-3 py-2.5 hover:bg-[#F0FDF4] transition-colors flex items-center gap-2 border-t border-[#E5E7EB]"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#1A56DB] shrink-0" />
              <span className="text-sm font-medium text-[#1A56DB]">+ Add &ldquo;{query}&rdquo; as new client</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function QuickAddClientDialog({
  open,
  onOpenChange,
  companies,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  companies: Company[]
  onCreated: (clientId: string, companyId?: string) => void
}) {
  const createClient = useCreateClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [clientType, setClientType] = useState<'corporate' | 'walkin'>('corporate')
  const [companyId, setCompanyId] = useState('')
  const [nameError, setNameError] = useState('')

  useEffect(() => {
    if (!open) {
      setName('')
      setPhone('')
      setEmail('')
      setClientType('corporate')
      setCompanyId('')
      setNameError('')
    }
  }, [open])

  async function handleSave() {
    if (!name.trim()) { setNameError('Name is required'); return }
    setNameError('')
    try {
      const result = await createClient.mutateAsync({
        name: name.trim(),
        primary_phone: phone.trim() || undefined,
        primary_email: email.trim() || undefined,
        client_type: clientType,
        company_id: clientType === 'corporate' && companyId ? companyId : undefined,
      }) as Client & { error?: string }
      if (!result.id) throw new Error(result.error || 'Failed to create client')
      toast.success(`${result.name} added`)
      onCreated(result.id, result.company_id ?? undefined)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create client')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => onOpenChange(Boolean(v))}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-[#191B23]">
            <UserPlus className="w-4 h-4 text-[#1A56DB]" />
            Quick Add Client
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="flex gap-2">
            <PillButton active={clientType === 'corporate'} onClick={() => setClientType('corporate')}>Corporate</PillButton>
            <PillButton active={clientType === 'walkin'} onClick={() => setClientType('walkin')}>Walk-in</PillButton>
          </div>
          <div>
            <Label className="text-xs text-[#737686] mb-1.5 block">Name <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
              placeholder="Client name"
              className="border-[#C3C5D7] h-9"
              autoFocus
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-[#737686] mb-1.5 block">Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="91XXXXXXXXXX" className="border-[#C3C5D7] h-9" />
            </div>
            <div>
              <Label className="text-xs text-[#737686] mb-1.5 block">Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="email@co.com" className="border-[#C3C5D7] h-9" />
            </div>
          </div>
          {clientType === 'corporate' && (
            <div>
              <Label className="text-xs text-[#737686] mb-1.5 block">Company</Label>
              <CompanyCombobox value={companyId} companies={companies} onChange={id => setCompanyId(id)} />
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={createClient.isPending}
            className="bg-[#1A56DB] hover:bg-[#003FB1]"
          >
            {createClient.isPending ? 'Saving…' : 'Add Client'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NewBookingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillClientId = searchParams.get('client_id') || ''
  const createBooking = useCreateBooking()
  const [error, setError] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)

  const [form, setForm] = useState<FormState>({
    booking_type: 'company',
    client_id: prefillClientId,
    company_id: '',
    guest_name: '',
    guest_phone: '',
    trip_type: 'local',
    service_type: 'one_way',
    total_days: '1',
    pickup_location: '',
    drop_location: '',
    pickup_date: '',
    pickup_time: '',
    vehicle_type: '',
    pax_count: '',
    special_instructions: '',
  })

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => fetch('/api/clients').then(r => r.json()),
  })
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => fetch('/api/companies').then(r => r.json()),
  })

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.pickup_location.trim()) { setError('Pickup location is required'); return }
    if (!form.pickup_date)            { setError('Pickup date is required'); return }
    if (!form.pickup_time)            { setError('Pickup time is required'); return }

    try {
      const booking = await createBooking.mutateAsync({
        pickup_location: form.pickup_location,
        drop_location: form.drop_location || undefined,
        pickup_date: form.pickup_date,
        pickup_time: form.pickup_time,
        pax_count: form.pax_count ? parseInt(form.pax_count) : undefined,
        vehicle_type: form.vehicle_type || undefined,
        trip_type: form.trip_type,
        service_type: form.service_type,
        total_days: form.total_days ? parseInt(form.total_days) : 1,
        guest_name: form.guest_name || undefined,
        guest_phone: form.guest_phone || undefined,
        special_instructions: form.special_instructions || undefined,
        client_id: form.client_id || undefined,
        company_id: form.company_id || undefined,
        booking_type: form.booking_type,
        source: 'manual',
      })
      toast.success(`Booking ${booking.booking_ref} created`)
      router.push(`/bookings/${booking.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create booking')
    }
  }

  const selectedClient  = clients.find(c => c.id === form.client_id)
  const selectedCompany = companies.find(c => c.id === form.company_id)

  // Summary fields for the right panel
  const summaryItems = [
    { label: 'Type', value: `${form.booking_type.charAt(0).toUpperCase() + form.booking_type.slice(1)} · ${form.trip_type.charAt(0).toUpperCase() + form.trip_type.slice(1)}` },
    { label: 'Client', value: selectedClient?.name || form.guest_name || null },
    { label: 'Company', value: selectedCompany?.name || null },
    { label: 'Pickup', value: form.pickup_location || null },
    { label: 'Drop', value: form.drop_location || null },
    { label: 'Date', value: form.pickup_date ? formatDate(form.pickup_date) : null },
    { label: 'Time', value: form.pickup_time || null },
    { label: 'Vehicle', value: form.vehicle_type || null },
    { label: 'Pax', value: form.pax_count ? `${form.pax_count} passenger${parseInt(form.pax_count) !== 1 ? 's' : ''}` : null },
    ...(parseInt(form.total_days) > 1 ? [{ label: 'Days', value: form.total_days }] : []),
  ].filter(i => i.value)

  const isReadyToSubmit = !!(form.pickup_location && form.pickup_date && form.pickup_time)

  return (
    <div>
      {/* Back link */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-[#434654] hover:text-[#191B23] -ml-1 py-1.5 px-2 rounded hover:bg-[#EDEDF8] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Bookings
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#191B23]">New Booking</h1>
          <p className="text-sm text-[#737686] mt-0.5">Create a manual booking</p>
        </div>
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
                      ? 'border-[#1A56DB] bg-[#EEF2FF] text-[#1A56DB]'
                      : 'border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB]/50'
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
                      ? 'border-[#1A56DB] bg-[#EEF2FF] text-[#1A56DB]'
                      : 'border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB]/50'
                  )}
                >
                  <User className="w-4 h-4" /> Personal
                </button>
              </div>
            </div>

            {/* Section 2: Who's Travelling */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={2} icon={User} title="Who's Travelling" />
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
                    onCreateNew={() => setShowQuickAdd(true)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Company</Label>
                  <Select value={form.company_id} items={companies.map(c => ({ value: c.id, label: c.name }))} onValueChange={v => v !== null && setField('company_id', v)}>
                    <SelectTrigger className="border-[#C3C5D7] h-9">
                      <SelectValue placeholder="Select company…" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
              </div>
            </div>

            {/* Section 3: Trip Details */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={3} icon={MapPin} title="Trip Details" />

              {/* Trip type pills */}
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

              {/* Locations */}
              <div className="space-y-3 mb-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#1A56DB]" />
                    Pickup Location <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.pickup_location}
                    onChange={e => setField('pickup_location', e.target.value)}
                    placeholder="Full pickup address"
                    className="border-[#C3C5D7] h-9"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#737686]" />
                    Drop Location
                    {form.trip_type !== 'local' && <span className="text-red-500 ml-0.5">*</span>}
                    {form.trip_type === 'local' && <span className="text-[#9CA3AF] ml-1">(optional)</span>}
                  </Label>
                  <Input
                    value={form.drop_location}
                    onChange={e => setField('drop_location', e.target.value)}
                    placeholder={form.trip_type === 'airport' ? 'Airport name' : 'Drop address'}
                    className="border-[#C3C5D7] h-9"
                  />
                </div>
              </div>

              {/* Date + Time + optional days */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.pickup_date}
                    onChange={e => setField('pickup_date', e.target.value)}
                    type="date"
                    className="border-[#C3C5D7] h-9"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Time <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={form.pickup_time}
                    onChange={e => setField('pickup_time', e.target.value)}
                    type="time"
                    className="border-[#C3C5D7] h-9"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs text-[#737686] mb-1.5 block">Total Days</Label>
                  <Input
                    value={form.total_days}
                    onChange={e => setField('total_days', e.target.value)}
                    type="number"
                    min="1"
                    className="border-[#C3C5D7] h-9"
                  />
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
            </div>

            {/* Section 4: Vehicle */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={4} icon={Car} title="Vehicle & Passengers" />

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

              <div className="max-w-[140px]">
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

            {/* Section 5: Notes */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-5">
              <SectionHeader n={5} icon={FileText} title="Notes" />
              <Textarea
                value={form.special_instructions}
                onChange={e => setField('special_instructions', e.target.value)}
                placeholder="Special instructions, notes for driver, flight details…"
                rows={3}
                className="border-[#C3C5D7] resize-none text-sm"
              />
            </div>
          </div>

          {/* ── Right: Summary ──────────────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="sticky top-20 bg-white rounded-xl border border-[#E5E7EB] p-5">
              <h3 className="text-sm font-semibold text-[#191B23] mb-4">Booking Summary</h3>

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

              {isReadyToSubmit && (
                <div className="flex items-center gap-1.5 text-xs text-green-600 mb-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  Required fields complete
                </div>
              )}

              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full bg-[#1A56DB] hover:bg-[#003FB1] rounded-lg"
                  disabled={createBooking.isPending || !isReadyToSubmit}
                  onClick={handleSubmit}
                >
                  {createBooking.isPending ? 'Creating…' : 'Create Booking'}
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
            </div>
          </div>

        </div>
      </form>

      <QuickAddClientDialog
        open={showQuickAdd}
        onOpenChange={setShowQuickAdd}
        companies={companies}
        onCreated={(clientId, companyId) => {
          setField('client_id', clientId)
          if (companyId) setField('company_id', companyId)
        }}
      />
    </div>
  )
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-[#737686]">Loading…</div>}>
      <NewBookingForm />
    </Suspense>
  )
}
