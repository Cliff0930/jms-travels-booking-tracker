'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUpdateDriver } from '@/hooks/useDrivers'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { Phone, Mail, Car, Users, Pencil, X, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Driver, VehicleType } from '@/types'

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
  const updateDriver = useUpdateDriver()

  const { data: stats, isLoading: statsLoading } = useQuery<DriverStats>({
    queryKey: ['driver-stats', driver?.id],
    queryFn: () => fetch(`/api/drivers/${driver!.id}/stats`).then(r => r.json()),
    enabled: open && !!driver,
  })

  if (!driver) return null
  const initials = driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')

  function startEdit() {
    setForm({
      name: driver!.name,
      phone: driver!.phone,
      email: driver!.email || '',
      vehicle_type: driver!.vehicle_type,
      vehicle_name: driver!.vehicle_name,
      vehicle_number: driver!.vehicle_number,
      vehicle_color: driver!.vehicle_color || '',
      seating_capacity: String(driver!.seating_capacity),
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
          phone: form.phone,
          email: form.email || null,
          vehicle_type: form.vehicle_type as VehicleType,
          vehicle_name: form.vehicle_name,
          vehicle_number: form.vehicle_number,
          vehicle_color: form.vehicle_color || null,
          seating_capacity: cap,
        } as Partial<Driver>,
      })
      toast.success('Driver updated')
      setEditing(false)
    } catch {
      toast.error('Failed to update driver')
    }
  }

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) { setEditing(false); onClose() } }}>
      <SheetContent className="w-full sm:w-[440px] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-5 border-b border-[#E5E7EB]">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#D4DCFF] flex items-center justify-center text-lg font-semibold text-[#1A56DB] shrink-0">
                  {initials}
                </div>
                <div>
                  <SheetTitle className="text-[#191B23]">{driver.name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <DriverStatusBadge status={driver.status} />
                    {!driver.is_active && (
                      <span className="text-xs font-medium text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">Inactive</span>
                    )}
                  </div>
                </div>
              </div>
              {!editing && (
                <Button size="sm" variant="outline" className="rounded-sm gap-1.5 shrink-0" onClick={startEdit}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              )}
            </div>
          </SheetHeader>
        </div>

        <div className="p-5 space-y-5">

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
              <div>
                <Label className="text-xs text-[#737686]">Email</Label>
                <Input type="email" value={form.email} onChange={e => setField('email', e.target.value)} className="border-[#C3C5D7] h-8 text-sm mt-1" />
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
                  <Input value={form.vehicle_name} onChange={e => setField('vehicle_name', e.target.value)} placeholder="Toyota Innova" className="border-[#C3C5D7] h-8 text-sm mt-1" />
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
                <div className="bg-[#F3F3FE] rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-[#1A56DB]">
                    {statsLoading ? '…' : (stats?.total_trips ?? 0)}
                  </p>
                  <p className="text-xs text-[#737686] mt-0.5">Total Trips</p>
                </div>
                <div className="bg-[#F3F3FE] rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-[#1A56DB]">
                    {statsLoading ? '…' : (stats?.this_month_trips ?? 0)}
                  </p>
                  <p className="text-xs text-[#737686] mt-0.5">This Month</p>
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
                <h3 className="text-label-caps text-[#737686] mb-2">Contact</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#191B23]">
                    <Phone className="w-4 h-4 text-[#737686] shrink-0" />
                    {driver.phone}
                  </div>
                  {driver.email ? (
                    <div className="flex items-center gap-2 text-sm text-[#191B23]">
                      <Mail className="w-4 h-4 text-[#737686] shrink-0" />
                      {driver.email}
                    </div>
                  ) : (
                    <p className="text-xs text-[#737686] pl-6">No email on file</p>
                  )}
                </div>
              </section>

              <Separator />

              {/* Vehicle */}
              <section>
                <h3 className="text-label-caps text-[#737686] mb-2">Vehicle</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#191B23]">
                    <Car className="w-4 h-4 text-[#737686] shrink-0" />
                    {driver.vehicle_name}
                    <span className="px-1.5 py-0.5 bg-[#EDEDF8] rounded text-xs text-[#434654]">{driver.vehicle_type}</span>
                  </div>
                  <div className="text-sm text-[#434654]">
                    Plate: <span className="font-medium text-[#191B23]">{driver.vehicle_number}</span>
                  </div>
                  {driver.vehicle_color && (
                    <div className="text-sm text-[#434654]">
                      Color: <span className="font-medium text-[#191B23]">{driver.vehicle_color}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-[#434654]">
                    <Users className="w-4 h-4 text-[#737686] shrink-0" />
                    {driver.seating_capacity} passengers
                  </div>
                </div>
              </section>

              {/* Recent Trips */}
              {!statsLoading && stats?.recent_trips && stats.recent_trips.length > 0 && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-label-caps text-[#737686] mb-2">Recent Trips</h3>
                    <div className="space-y-2.5">
                      {stats.recent_trips.map(trip => (
                        <div key={trip.booking_ref} className="flex items-start gap-2">
                          <Link href={`/bookings/${trip.id}`} className="text-xs font-semibold text-[#1A56DB] hover:underline shrink-0 pt-0.5">{trip.booking_ref}</Link>
                          <div className="min-w-0">
                            {trip.pickup_location && (
                              <p className="text-xs text-[#191B23] truncate">
                                {trip.pickup_location}
                                {trip.drop_location && <span className="text-[#737686]"> → {trip.drop_location}</span>}
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
