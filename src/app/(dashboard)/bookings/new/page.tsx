'use client'
import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCreateBooking } from '@/hooks/useBookings'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import type { Client, Company } from '@/types'
import { Suspense } from 'react'

const VEHICLE_TYPES = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface FormState {
  pickup_location: string
  drop_location: string
  pickup_date: string
  pickup_time: string
  pax_count: string
  vehicle_type: string
  trip_type: 'local' | 'outstation'
  service_type: 'one_way' | 'return'
  total_days: string
  guest_name: string
  guest_phone: string
  special_instructions: string
  client_id: string
  company_id: string
}

function NewBookingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefillClientId = searchParams.get('client_id') || ''
  const createBooking = useCreateBooking()
  const [error, setError] = useState('')

  const [form, setForm] = useState<FormState>({
    pickup_location: '', drop_location: '', pickup_date: '', pickup_time: '',
    pax_count: '', vehicle_type: '', trip_type: 'local', service_type: 'one_way',
    total_days: '1', guest_name: '', guest_phone: '', special_instructions: '',
    client_id: prefillClientId, company_id: '',
  })

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ['clients'], queryFn: () => fetch('/api/clients').then(r => r.json()) })
  const { data: companies = [] } = useQuery<Company[]>({ queryKey: ['companies'], queryFn: () => fetch('/api/companies').then(r => r.json()) })

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.pickup_location.trim()) { setError('Pickup location is required'); return }
    if (!form.pickup_date) { setError('Pickup date is required'); return }
    if (!form.pickup_time) { setError('Pickup time is required'); return }

    try {
      const booking = await createBooking.mutateAsync({
        pickup_location: form.pickup_location || undefined,
        drop_location: form.drop_location || undefined,
        pickup_date: form.pickup_date || undefined,
        pickup_time: form.pickup_time || undefined,
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
        source: 'manual',
      })
      toast.success(`Booking ${booking.booking_ref} created`)
      router.push(`/bookings/${booking.id}`)
    } catch {
      toast.error('Failed to create booking')
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="New Booking" description="Create a manual booking" />

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

        <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
          <h2 className="text-base font-semibold text-[#191B23] mb-4">Client Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Client</Label>
              <Select value={form.client_id} onValueChange={v => v !== null && setField('client_id', v)}>
                <SelectTrigger className="border-[#C3C5D7]">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company</Label>
              <Select value={form.company_id} onValueChange={v => v !== null && setField('company_id', v)}>
                <SelectTrigger className="border-[#C3C5D7]">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Guest Name <span className="text-[#737686] text-xs">(if different from client)</span></Label>
              <Input value={form.guest_name} onChange={e => setField('guest_name', e.target.value)} className="border-[#C3C5D7]" />
            </div>
            <div>
              <Label>Guest Phone</Label>
              <Input value={form.guest_phone} onChange={e => setField('guest_phone', e.target.value)} className="border-[#C3C5D7]" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
          <h2 className="text-base font-semibold text-[#191B23] mb-4">Trip Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>
                Pickup Location *
                <span className="ml-1 text-xs text-red-500">(mandatory)</span>
              </Label>
              <Input value={form.pickup_location} onChange={e => setField('pickup_location', e.target.value)} placeholder="Full pickup address" className="border-[#C3C5D7]" required />
            </div>
            <div className="col-span-2">
              <Label>Drop Location <span className="text-[#737686] text-xs">(optional)</span></Label>
              <Input value={form.drop_location} onChange={e => setField('drop_location', e.target.value)} placeholder="Drop address (leave blank if unknown)" className="border-[#C3C5D7]" />
            </div>
            <div>
              <Label>Pickup Date *</Label>
              <Input value={form.pickup_date} onChange={e => setField('pickup_date', e.target.value)} type="date" className="border-[#C3C5D7]" required />
            </div>
            <div>
              <Label>Pickup Time *</Label>
              <Input value={form.pickup_time} onChange={e => setField('pickup_time', e.target.value)} type="time" className="border-[#C3C5D7]" required />
            </div>
            <div>
              <Label>Trip Type</Label>
              <Select value={form.trip_type} onValueChange={v => v !== null && setField('trip_type', v as 'local' | 'outstation')}>
                <SelectTrigger className="border-[#C3C5D7]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="outstation">Outstation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={form.service_type} onValueChange={v => v !== null && setField('service_type', v as 'one_way' | 'return')}>
                <SelectTrigger className="border-[#C3C5D7]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_way">One Way</SelectItem>
                  <SelectItem value="return">Return</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.trip_type === 'outstation' && (
              <div>
                <Label>Total Days</Label>
                <Input value={form.total_days} onChange={e => setField('total_days', e.target.value)} type="number" min="1" className="border-[#C3C5D7]" />
              </div>
            )}
            <div>
              <Label>Passengers</Label>
              <Input value={form.pax_count} onChange={e => setField('pax_count', e.target.value)} type="number" min="1" className="border-[#C3C5D7]" />
            </div>
            <div>
              <Label>Vehicle Type</Label>
              <Select value={form.vehicle_type} onValueChange={v => v !== null && setField('vehicle_type', v)}>
                <SelectTrigger className="border-[#C3C5D7]"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Special Instructions</Label>
              <Textarea value={form.special_instructions} onChange={e => setField('special_instructions', e.target.value)} rows={2} className="border-[#C3C5D7]" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" className="rounded-sm" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" disabled={createBooking.isPending}>
            {createBooking.isPending ? 'Creating…' : 'Create Booking'}
          </Button>
        </div>
      </form>
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
