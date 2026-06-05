'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUpdateDriver } from '@/hooks/useDrivers'
import { useCanEdit } from '@/hooks/useCurrentUser'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { Phone, Mail, Car, Users, Pencil, X, MapPin, Smartphone, KeyRound, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Driver, VehicleType } from '@/types'
import { normalizePhone } from '@/lib/utils/phone'
import { WaBadge } from '@/components/shared/WaBadge'

const VEHICLE_TYPES: VehicleType[] = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface DriverStats {
  total_trips: number
  this_month_trips: number
  recent_trips: Array<{
    id: string
    booking_ref: string
    pickup_date: string | null
    pickup_location: string | null
    drop_location: string | null
    trip_type: string
  }>
  current_booking: {
    id: string
    booking_ref: string
    pickup_date: string | null
    pickup_time: string | null
    pickup_location: string | null
    drop_location: string | null
    trip_type: string
    status: string
  } | null
}

interface Props {
  driver: Driver | null
  open: boolean
  onClose: () => void
  onDeactivate?: (id: string) => void
  onReactivate?: (id: string) => void
}

export function DriverDetailPanel({ driver, open, onClose, onDeactivate, onReactivate }: Props) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [swappingPhone, setSwappingPhone] = useState(false)
  const updateDriver = useUpdateDriver()

  const { data: stats, isLoading: statsLoading } = useQuery<DriverStats>({
    queryKey: ['driver-stats', driver?.id],
    queryFn: () => fetch(`/api/drivers/${driver!.id}/stats`).then(r => r.json()),
    enabled: open && !!driver,
  })

  const { data: vehicleNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['vehicle-names'],
    queryFn: () => fetch('/api/vehicle-names').then(r => r.json()),
  })

  const canEdit = useCanEdit()

  if (!driver) return null
  const initials = driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')

  function startEdit() {
    setForm({
      name: driver!.name,
      phone: driver!.phone,
      secondary_phone: driver!.secondary_phone || '',
      email: driver!.email || '',
      vehicle_type: driver!.vehicle_type,
      vehicle_name: driver!.vehicle_name,
      vehicle_number: driver!.vehicle_number,
      vehicle_color: driver!.vehicle_color || '',
      seating_capacity: String(driver!.seating_capacity),
      bata_rate: driver!.bata_rate != null ? String(driver!.bata_rate) : '',
      bata_rate_outstation: driver!.bata_rate_outstation != null ? String(driver!.bata_rate_outstation) : '',
      driver_type: driver!.driver_type ?? 'owner',
      commission_percent: driver!.commission_percent != null ? String(driver!.commission_percent) : '20',
      monthly_salary: driver!.monthly_salary != null ? String(driver!.monthly_salary) : '',
      advance_emi_amount:        driver!.advance_emi_amount        != null ? String(driver!.advance_emi_amount)        : '',
      fixed_rate_4hr:            (driver as Record<string,unknown>).fixed_rate_4hr            != null ? String((driver as Record<string,unknown>).fixed_rate_4hr)            : '',
      fixed_rate_8hr:            (driver as Record<string,unknown>).fixed_rate_8hr            != null ? String((driver as Record<string,unknown>).fixed_rate_8hr)            : '',
      fixed_rate_extra_km:       (driver as Record<string,unknown>).fixed_rate_extra_km       != null ? String((driver as Record<string,unknown>).fixed_rate_extra_km)       : '',
      fixed_rate_extra_hr:       (driver as Record<string,unknown>).fixed_rate_extra_hr       != null ? String((driver as Record<string,unknown>).fixed_rate_extra_hr)       : '',
      fixed_rate_outstation_km:  (driver as Record<string,unknown>).fixed_rate_outstation_km  != null ? String((driver as Record<string,unknown>).fixed_rate_outstation_km)  : '',
      fixed_rate_bata:           (driver as Record<string,unknown>).fixed_rate_bata           != null ? String((driver as Record<string,unknown>).fixed_rate_bata)           : '',
    })
    setEditing(true)
  }

  function setField(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    const cap = parseInt(form.seating_capacity)
    if (!form.name?.trim() || !form.phone?.trim() || !form.vehicle_type || !form.vehicle_name?.trim() || !form.vehicle_number?.trim() || isNaN(cap)) {
      toast.error('Please fill all required fields')
      return
    }
    try {
      await updateDriver.mutateAsync({
        id: driver!.id,
        data: {
          name: form.name,
          phone: normalizePhone(form.phone),
          secondary_phone: form.secondary_phone ? normalizePhone(form.secondary_phone) : null,
          email: form.email || null,
          vehicle_type: form.vehicle_type as VehicleType,
          vehicle_name: form.vehicle_name,
          vehicle_number: form.vehicle_number,
          vehicle_color: form.vehicle_color || null,
          seating_capacity: cap,
          bata_rate: form.bata_rate ? Number(form.bata_rate) : null,
          bata_rate_outstation: form.bata_rate_outstation ? Number(form.bata_rate_outstation) : null,
          driver_type: form.driver_type,
          commission_percent: form.driver_type === 'owner' && form.commission_percent ? Number(form.commission_percent) : null,
          monthly_salary: form.driver_type === 'salary' && form.monthly_salary ? Number(form.monthly_salary) : null,
          advance_emi_amount:        form.advance_emi_amount        ? Number(form.advance_emi_amount)        : null,
          fixed_rate_4hr:            (form as Record<string,string>).fixed_rate_4hr            ? Number((form as Record<string,string>).fixed_rate_4hr)            : null,
          fixed_rate_8hr:            (form as Record<string,string>).fixed_rate_8hr            ? Number((form as Record<string,string>).fixed_rate_8hr)            : null,
          fixed_rate_extra_km:       (form as Record<string,string>).fixed_rate_extra_km       ? Number((form as Record<string,string>).fixed_rate_extra_km)       : null,
          fixed_rate_extra_hr:       (form as Record<string,string>).fixed_rate_extra_hr       ? Number((form as Record<string,string>).fixed_rate_extra_hr)       : null,
          fixed_rate_outstation_km:  (form as Record<string,string>).fixed_rate_outstation_km  ? Number((form as Record<string,string>).fixed_rate_outstation_km)  : null,
          fixed_rate_bata:           (form as Record<string,string>).fixed_rate_bata           ? Number((form as Record<string,string>).fixed_rate_bata)           : null,
        } as Partial<Driver>,
      })
      toast.success('Driver updated')
      setEditing(false)
    } catch {
      toast.error('Failed to update driver')
    }
  }

  async function handleSwapPhone() {
    if (!driver!.secondary_phone) return
    setSwappingPhone(true)
    try {
      await updateDriver.mutateAsync({
        id: driver!.id,
        data: { phone: driver!.secondary_phone, secondary_phone: driver!.phone } as Partial<Driver>,
      })
      toast.success('Primary phone updated')
    } catch {
      toast.error('Failed to swap phones')
    } finally {
      setSwappingPhone(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) { setEditing(false); onClose() } }}>
      <SheetContent className="w-full md:w-3/4 lg:w-1/2 p-0 flex flex-col" showCloseButton={false}>
        {/* Gradient Header */}
        <div className="bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] p-5 flex-shrink-0">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-xl font-bold text-white shrink-0">
                  {initials}
                </div>
                <div>
                  <SheetTitle className="text-white text-lg font-bold">{driver.name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      driver.status === 'available' ? 'bg-emerald-400/30 text-emerald-100'
                      : driver.status === 'on_duty' ? 'bg-blue-300/30 text-blue-100'
                      : 'bg-white/20 text-white/80'
                    }`}>
                      {driver.status.replace('_', ' ')}
                    </span>
                    {!driver.is_active && (
                      <span className="text-[11px] font-semibold bg-red-400/30 text-red-100 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!editing && canEdit && (
                  <Button size="sm" variant="ghost" className="rounded-sm gap-1.5 text-white/80 hover:text-white hover:bg-white/20 border border-white/30 h-8 text-xs" onClick={startEdit}>
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => { setEditing(false); onClose() }} className="text-white/80 hover:text-white hover:bg-white/20">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Edit Form */}
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686]">Name *</Label>
                  <Input value={form.name} onChange={e => setField('name', e.target.value)} className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-[#737686]">Phone *</Label>
                  <Input value={form.phone} onChange={e => setField('phone', e.target.value)} className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686]">Secondary Phone</Label>
                  <Input value={form.secondary_phone} onChange={e => setField('secondary_phone', e.target.value)} className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-[#737686]">Email</Label>
                  <Input type="email" value={form.email} onChange={e => setField('email', e.target.value)} className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686]">Vehicle Type *</Label>
                  <Select value={form.vehicle_type} onValueChange={v => v && setField('vehicle_type', v)}>
                    <SelectTrigger className="border-[#C3C5D7] h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-[#737686]">Capacity *</Label>
                  <Input type="number" min="1" value={form.seating_capacity} onChange={e => setField('seating_capacity', e.target.value)} className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686]">Vehicle Name *</Label>
                  <Select value={form.vehicle_name} onValueChange={v => v !== null && setField('vehicle_name', v)}>
                    <SelectTrigger className="border-[#C3C5D7] h-8 text-sm mt-1">
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {form.vehicle_name && !vehicleNames.some(v => v.name === form.vehicle_name) && (
                        <SelectItem value={form.vehicle_name}>{form.vehicle_name}</SelectItem>
                      )}
                      {vehicleNames.map(v => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-[#737686]">Plate Number *</Label>
                  <Input value={form.vehicle_number} onChange={e => setField('vehicle_number', e.target.value)} placeholder="KA 01 AB 1234" className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
              </div>
              <div>
                <Label className="text-xs text-[#737686]">Vehicle Color</Label>
                <Input value={form.vehicle_color} onChange={e => setField('vehicle_color', e.target.value)} placeholder="White" className="border-[#C3C5D7] h-8 text-sm mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-[#737686]">Local Bata Rate (₹)</Label>
                  <Input type="number" min="0" value={form.bata_rate} onChange={e => setField('bata_rate', e.target.value)} placeholder="e.g. 300" className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-[#737686]">Outstation Bata Rate (₹)</Label>
                  <Input type="number" min="0" value={form.bata_rate_outstation} onChange={e => setField('bata_rate_outstation', e.target.value)} placeholder="e.g. 500" className="border-[#C3C5D7] h-8 text-sm mt-1" />
                </div>
              </div>

              {/* Settlement fields */}
              <div className="border-t border-[#E5E7EB] pt-3">
                <p className="text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-2">Settlement Settings</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-[#737686]">Driver Type</Label>
                    <select
                      value={form.driver_type}
                      onChange={e => setField('driver_type', e.target.value)}
                      className="mt-1 w-full h-8 px-2 text-sm border border-[#C3C5D7] rounded-md bg-white focus:outline-none focus:border-[#1A56DB]"
                    >
                      <option value="owner">Owner-Driver (pays commission to JMS)</option>
                      <option value="salary">Salary Driver (JMS-owned vehicle)</option>
                    </select>
                  </div>
                  {form.driver_type === 'owner' && (
                    <div>
                      <Label className="text-xs text-[#737686]">JMS Commission % (kept by JMS from hire)</Label>
                      <Input type="number" min="0" max="100" value={form.commission_percent} onChange={e => setField('commission_percent', e.target.value)} placeholder="e.g. 20" className="border-[#C3C5D7] h-8 text-sm mt-1" />
                      <p className="text-xs text-[#9CA3AF] mt-0.5">Driver gets {100 - Number(form.commission_percent || 0)}% of hire charges</p>
                    </div>
                  )}
                  {form.driver_type === 'salary' && (
                    <div>
                      <Label className="text-xs text-[#737686]">Monthly Salary (₹)</Label>
                      <Input type="number" min="0" value={form.monthly_salary} onChange={e => setField('monthly_salary', e.target.value)} placeholder="e.g. 18000" className="border-[#C3C5D7] h-8 text-sm mt-1" />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-[#737686]">Advance EMI Amount (₹/month) — leave blank for full deduction</Label>
                    <Input type="number" min="0" value={form.advance_emi_amount} onChange={e => setField('advance_emi_amount', e.target.value)} placeholder="e.g. 2000 (blank = deduct full balance)" className="border-[#C3C5D7] h-8 text-sm mt-1" />
                  </div>
                </div>
              </div>

              {/* Fixed Rate Deal */}
              <div className="bg-[#F3F3FE] rounded-lg border border-[#C3C5D7] p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 mb-1">Fixed Rate Deal <span className="font-normal text-[#737686] normal-case">(optional — overrides commission for all companies)</span></p>
                <p className="text-[11px] text-[#737686] mb-2">Leave blank to use commission%. Fill any field to override that slab for this driver.</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: 'fixed_rate_4hr',           label: '4hr/40km (₹)' },
                    { key: 'fixed_rate_8hr',           label: '8hr/80km (₹)' },
                    { key: 'fixed_rate_extra_km',      label: 'Extra KM (₹/km)' },
                    { key: 'fixed_rate_extra_hr',      label: 'Extra Hour (₹/hr)' },
                    { key: 'fixed_rate_outstation_km', label: 'Outstation (₹/km)' },
                    { key: 'fixed_rate_bata',          label: 'Bata/day (₹)' },
                  ] as { key: string; label: string }[]).map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs text-[#737686]">{label}</Label>
                      <Input
                        type="number" min="0"
                        value={(form as Record<string, string>)[key] ?? ''}
                        onChange={e => setField(key, e.target.value)}
                        placeholder="—"
                        className="border-[#C3C5D7] h-8 text-sm mt-0.5"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  className="flex-1 bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
                  onClick={handleSave}
                  disabled={updateDriver.isPending}
                >
                  {updateDriver.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button variant="outline" className="rounded-sm" onClick={() => setEditing(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Trip Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gradient-to-br from-[#1A56DB] to-[#4F46E5] rounded-xl p-4 text-center shadow-sm">
                  <p className="text-3xl font-bold text-white">
                    {statsLoading ? '…' : (stats?.total_trips ?? 0)}
                  </p>
                  <p className="text-xs text-blue-100 mt-1 font-medium">Total Trips</p>
                </div>
                <div className="bg-gradient-to-br from-[#7C3AED] to-[#9333EA] rounded-xl p-4 text-center shadow-sm">
                  <p className="text-3xl font-bold text-white">
                    {statsLoading ? '…' : (stats?.this_month_trips ?? 0)}
                  </p>
                  <p className="text-xs text-purple-100 mt-1 font-medium">This Month</p>
                </div>
              </div>

              {/* Current Assignment */}
              {stats?.current_booking && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700 mb-2">Current Assignment</p>
                  <Link href={`/bookings/${stats.current_booking.id}`} className="text-sm font-semibold text-[#1A56DB] hover:underline">
                    {stats.current_booking.booking_ref}
                  </Link>
                  <div className="mt-1.5 space-y-1">
                    {stats.current_booking.pickup_location && (
                      <p className="text-xs text-[#434654] flex items-start gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          {stats.current_booking.pickup_location}
                          {stats.current_booking.drop_location && (
                            <span className="text-[#737686]"> → {stats.current_booking.drop_location}</span>
                          )}
                        </span>
                      </p>
                    )}
                    {stats.current_booking.pickup_date && (
                      <p className="text-xs text-[#737686] pl-5">
                        {stats.current_booking.pickup_date}
                        {stats.current_booking.pickup_time && ` · ${stats.current_booking.pickup_time}`}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Contact */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#7C3AED] mb-3">Contact</h3>
                <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm text-[#191B23] group">
                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5 text-[#7C3AED]" />
                    </div>
                    <a href={`tel:${driver.phone}`} className="font-medium hover:underline hover:text-[#7C3AED] flex-1">{driver.phone}</a>
                    <WaBadge phone={driver.phone} />
                    <a href={`https://wa.me/${driver.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[#25D366] hover:text-[#128C7E]" title="WhatsApp">
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </a>
                    <span className="text-[10px] font-semibold text-violet-400 bg-violet-100 px-1.5 py-0.5 rounded-full">primary</span>
                  </div>
                  {driver.secondary_phone && (
                    <div className="flex items-center gap-2.5 text-sm text-[#434654] group">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                        <Phone className="w-3.5 h-3.5 text-[#7C3AED]" />
                      </div>
                      <a href={`tel:${driver.secondary_phone}`} className="font-medium hover:underline hover:text-[#7C3AED] flex-1">{driver.secondary_phone}</a>
                      <WaBadge phone={driver.secondary_phone} />
                      <a href={`https://wa.me/${driver.secondary_phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-[#25D366] hover:text-[#128C7E]" title="WhatsApp">
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </a>
                      {canEdit && (
                        <button
                          onClick={handleSwapPhone}
                          disabled={swappingPhone}
                          className="p-1 rounded text-[#737686] hover:text-emerald-600 hover:bg-white transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                          title="Set as primary"
                        >
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                  {driver.email ? (
                    <div className="flex items-center gap-2.5 text-sm text-[#191B23]">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                        <Mail className="w-3.5 h-3.5 text-[#7C3AED]" />
                      </div>
                      <a href={`mailto:${driver.email}`} className="font-medium hover:underline hover:text-[#7C3AED]">{driver.email}</a>
                    </div>
                  ) : (
                    <p className="text-xs text-[#737686] pl-9">No email on file</p>
                  )}
                </div>
              </section>

              {/* Vehicle */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A56DB] mb-3">Vehicle</h3>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 space-y-2.5">
                  <div className="flex items-center gap-2.5 text-sm text-[#191B23]">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Car className="w-3.5 h-3.5 text-[#1A56DB]" />
                    </div>
                    <span className="font-semibold">{driver.vehicle_name}</span>
                    <span className="px-2 py-0.5 bg-blue-200 rounded-full text-xs font-medium text-[#1A56DB]">{driver.vehicle_type}</span>
                  </div>
                  <div className="flex items-center gap-2 pl-9 text-sm text-[#434654]">
                    <span>Plate:</span>
                    <span className="font-bold text-[#191B23] tracking-wider">{driver.vehicle_number}</span>
                  </div>
                  {driver.vehicle_color && (
                    <div className="text-sm text-[#434654] pl-9">
                      Color: <span className="font-medium text-[#191B23]">{driver.vehicle_color}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2.5 text-sm text-[#434654]">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5 text-[#1A56DB]" />
                    </div>
                    <span className="font-medium">{driver.seating_capacity} passengers</span>
                  </div>
                  {(driver.bata_rate != null || driver.bata_rate_outstation != null) && (
                    <div className="text-sm text-[#434654] pl-9 space-y-0.5">
                      {driver.bata_rate != null && (
                        <div>Local Bata: <span className="font-semibold text-[#191B23]">₹{driver.bata_rate}/bata</span></div>
                      )}
                      {driver.bata_rate_outstation != null && (
                        <div>Outstation Bata: <span className="font-semibold text-[#191B23]">₹{driver.bata_rate_outstation}/bata</span></div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Recent Trips */}
              {!statsLoading && stats?.recent_trips && stats.recent_trips.length > 0 && (
                <>
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#059669] mb-3">Recent Trips</h3>
                    <div className="space-y-2">
                      {stats.recent_trips.map(trip => (
                        <div key={trip.booking_ref} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 hover:border-emerald-300 transition-all group">
                          <Link href={`/bookings/${trip.id}`} className="text-xs font-bold text-[#059669] hover:underline shrink-0 pt-0.5 group-hover:text-[#047857]">{trip.booking_ref}</Link>
                          <div className="min-w-0 flex-1">
                            {trip.pickup_location && (
                              <p className="text-xs text-[#191B23] truncate font-medium">
                                {trip.pickup_location}
                                {trip.drop_location && <span className="text-[#737686] font-normal"> → {trip.drop_location}</span>}
                              </p>
                            )}
                            {trip.pickup_date && (
                              <p className="text-xs text-[#737686] mt-0.5">{trip.pickup_date} · <span className="capitalize">{trip.trip_type}</span></p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {/* Driver App PIN */}
          {!editing && <DriverAppPin driver={driver} />}

          {/* Deactivate / Reactivate */}
          {!editing && (
            <>
              <Separator />
              {driver.is_active ? (
                onDeactivate && (
                  <Button
                    variant="outline"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50 rounded-sm"
                    onClick={() => onDeactivate(driver.id)}
                  >
                    Deactivate Driver
                  </Button>
                )
              ) : (
                onReactivate && (
                  <Button
                    variant="outline"
                    className="w-full text-green-700 border-green-200 hover:bg-green-50 rounded-sm"
                    onClick={() => onReactivate(driver.id)}
                  >
                    Reactivate Driver
                  </Button>
                )
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DriverAppPin({ driver }: { driver: Driver }) {
  const { id: driverId } = driver
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const updateDriver = useUpdateDriver()

  async function handleSet() {
    if (!pin || pin.length < 4) { toast.error('PIN must be at least 4 digits'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/drivers/${driverId}/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      toast.success('App PIN set — driver can now log in')
      setPin('')
      setOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to set PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-[#059669] mb-3 flex items-center gap-1.5">
        <Smartphone className="w-3.5 h-3.5" /> Driver App
      </h3>
      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 space-y-3">
        {/* uses_app toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#374151]">Uses Driver App</p>
            {driver.last_app_seen ? (
              <p className="text-xs text-[#737686] mt-0.5">Last seen: {new Date(driver.last_app_seen).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            ) : (
              <p className="text-xs text-[#737686] mt-0.5">Never logged in</p>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await updateDriver.mutateAsync({ id: driver.id, data: { uses_app: !driver.uses_app } as Partial<Driver> })
                toast.success(driver.uses_app ? 'WhatsApp trip briefs re-enabled' : 'App driver — WhatsApp briefs will be skipped')
              } catch { toast.error('Failed to update') }
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${driver.uses_app ? 'bg-emerald-500' : 'bg-[#C3C5D7]'}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${driver.uses_app ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="border-t border-emerald-200" />
        {!open ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#374151]">Set a PIN so this driver can log in to the JMS Driver app.</p>
            <Button
              size="sm"
              variant="outline"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-100 rounded-sm gap-1.5 shrink-0 ml-3"
              onClick={() => setOpen(true)}
            >
              <KeyRound className="w-3.5 h-3.5" /> Set PIN
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs text-[#374151] font-semibold">New PIN (4–6 digits)</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 1234"
                className="border-emerald-300 h-8 text-sm w-32"
                autoFocus
              />
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 rounded-sm"
                onClick={handleSet}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="outline" className="rounded-sm" onClick={() => { setOpen(false); setPin('') }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
