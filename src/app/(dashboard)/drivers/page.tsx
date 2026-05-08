'use client'
import { useState } from 'react'
import { useDrivers, useCreateDriver, useUpdateDriver } from '@/hooks/useDrivers'
import { DriverCard } from '@/components/drivers/DriverCard'
import { DriverDetailPanel } from '@/components/drivers/DriverDetailPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Driver, DriverStatus, VehicleType } from '@/types'

const VEHICLE_TYPES: VehicleType[] = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface DriverFormState {
  name: string
  phone: string
  email: string
  vehicle_type: VehicleType | ''
  vehicle_name: string
  vehicle_number: string
  vehicle_color: string
  seating_capacity: string
}

const EMPTY_FORM: DriverFormState = {
  name: '', phone: '', email: '', vehicle_type: '', vehicle_name: '',
  vehicle_number: '', vehicle_color: '', seating_capacity: '',
}

export default function DriversPage() {
  const [statusFilter, setStatusFilter] = useState<DriverStatus | 'all'>('all')
  const [vehicleFilter, setVehicleFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState<DriverFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  const { data: drivers = [], isLoading } = useDrivers({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    activeOnly: showInactive ? false : undefined,
  })
  const createDriver = useCreateDriver()
  const updateDriver = useUpdateDriver()

  const filtered = drivers.filter(d => {
    if (vehicleFilter !== 'all' && d.vehicle_type !== vehicleFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!d.name.toLowerCase().includes(q) && !d.phone.includes(q) && !(d.vehicle_number || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  function setField<K extends keyof DriverFormState>(key: K, val: DriverFormState[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.phone.trim() || !form.vehicle_type || !form.vehicle_name.trim() || !form.vehicle_number.trim()) {
      setFormError('Please fill all required fields')
      return
    }
    const cap = parseInt(form.seating_capacity)
    if (isNaN(cap) || cap < 1) { setFormError('Invalid seating capacity'); return }
    try {
      await createDriver.mutateAsync({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        vehicle_type: form.vehicle_type as VehicleType,
        vehicle_name: form.vehicle_name,
        vehicle_number: form.vehicle_number,
        vehicle_color: form.vehicle_color || undefined,
        seating_capacity: cap,
      } as Partial<Driver>)
      toast.success('Driver added')
      setShowAddModal(false)
      setForm(EMPTY_FORM)
    } catch {
      toast.error('Failed to add driver')
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await updateDriver.mutateAsync({ id, data: { is_active: false } as Partial<Driver> })
      toast.success('Driver deactivated')
      setSelectedDriver(null)
    } catch {
      toast.error('Failed to deactivate driver')
    }
  }

  async function handleReactivate(id: string) {
    try {
      await updateDriver.mutateAsync({ id, data: { is_active: true, status: 'available' } as Partial<Driver> })
      toast.success('Driver reactivated')
      setSelectedDriver(null)
    } catch {
      toast.error('Failed to reactivate driver')
    }
  }

  return (
    <div>
      <PageHeader
        title="Drivers"
        description={`${filtered.length} of ${drivers.length} drivers`}
        actions={
          <Button
            size="sm"
            className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm gap-1.5"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" /> Add Driver
          </Button>
        }
      />

      <div className="mb-5 bg-white rounded-lg border border-[#E5E7EB] p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as DriverStatus | 'all')}>
            <TabsList className="bg-[#EDEDF8] h-8">
              <TabsTrigger value="all" className="text-xs h-7 data-[state=active]:bg-white">All</TabsTrigger>
              <TabsTrigger value="available" className="text-xs h-7 data-[state=active]:bg-white">Available</TabsTrigger>
              <TabsTrigger value="on_duty" className="text-xs h-7 data-[state=active]:bg-white">On Duty</TabsTrigger>
              <TabsTrigger value="off_duty" className="text-xs h-7 data-[state=active]:bg-white">Off Duty</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={vehicleFilter} onValueChange={v => v !== null && setVehicleFilter(v)}>
            <SelectTrigger className="w-36 h-8 text-xs border-[#C3C5D7]">
              <SelectValue placeholder="All Vehicles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vehicles</SelectItem>
              {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => setShowInactive(v => !v)}
            className={`ml-auto h-8 px-3 text-xs rounded-md border transition-colors ${showInactive ? 'bg-[#1A56DB] text-white border-[#1A56DB]' : 'border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB] hover:text-[#1A56DB]'}`}
          >
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737686] pointer-events-none" />
          <Input
            placeholder="Search by name, phone, or plate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs border-[#C3C5D7]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-[#737686]">Loading drivers…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#737686]">No drivers found</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(driver => (
            <DriverCard
              key={driver.id}
              driver={driver}
              onSelect={setSelectedDriver}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}

      <DriverDetailPanel
        driver={selectedDriver}
        open={!!selectedDriver}
        onClose={() => setSelectedDriver(null)}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
      />

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Driver</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            {formError && <p className="text-xs text-red-500">{formError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setField('name', e.target.value)} className="border-[#C3C5D7]" required />
              </div>
              <div>
                <Label>Phone *</Label>
                <Input value={form.phone} onChange={e => setField('phone', e.target.value)} className="border-[#C3C5D7]" required />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setField('email', e.target.value)} type="email" className="border-[#C3C5D7]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vehicle Type *</Label>
                <Select value={form.vehicle_type} onValueChange={v => v !== null && setField('vehicle_type', v as VehicleType)}>
                  <SelectTrigger className="border-[#C3C5D7]">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Capacity *</Label>
                <Input value={form.seating_capacity} onChange={e => setField('seating_capacity', e.target.value)} type="number" min="1" className="border-[#C3C5D7]" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vehicle Name *</Label>
                <Input value={form.vehicle_name} onChange={e => setField('vehicle_name', e.target.value)} placeholder="Toyota Innova" className="border-[#C3C5D7]" required />
              </div>
              <div>
                <Label>Plate Number *</Label>
                <Input value={form.vehicle_number} onChange={e => setField('vehicle_number', e.target.value)} placeholder="KA 01 AB 1234" className="border-[#C3C5D7]" required />
              </div>
            </div>
            <div>
              <Label>Vehicle Color</Label>
              <Input value={form.vehicle_color} onChange={e => setField('vehicle_color', e.target.value)} placeholder="White" className="border-[#C3C5D7]" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" disabled={createDriver.isPending}>
                {createDriver.isPending ? 'Adding…' : 'Add Driver'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
