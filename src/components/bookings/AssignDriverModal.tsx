'use client'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { AlertTriangle, Car, Navigation, Search } from 'lucide-react'
import { useDrivers } from '@/hooks/useDrivers'
import { useAssignDriver } from '@/hooks/useBookings'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { toast } from 'sonner'
import type { Booking, Driver } from '@/types'

interface AssignDriverModalProps {
  booking: Booking
  open: boolean
  onClose: () => void
}

export function AssignDriverModal({ booking, open, onClose }: AssignDriverModalProps) {
  const { data: allDrivers = [] } = useDrivers()
  const assignDriver = useAssignDriver()
  const [conflictDriver, setConflictDriver] = useState<Driver | null>(null)
  const [gpsEnabled, setGpsEnabled] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!open) setSearchQuery('')
  }, [open])

  function matchesSearch(driver: Driver): boolean {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    const plate = driver.vehicle_number.replace(/\s+/g, '').toLowerCase()
    const queryNorm = q.replace(/\s+/g, '')
    return (
      driver.name.toLowerCase().includes(q) ||
      driver.vehicle_type.toLowerCase().includes(q) ||
      driver.vehicle_name.toLowerCase().includes(q) ||
      plate.includes(queryNorm)
    )
  }

  function isVehicleMatch(driver: Driver): boolean {
    if (!booking.vehicle_type) return true
    const q = booking.vehicle_type.toLowerCase().trim()
    return (
      driver.vehicle_type.toLowerCase().includes(q) ||
      q.includes(driver.vehicle_type.toLowerCase()) ||
      driver.vehicle_name.toLowerCase().includes(q) ||
      q.includes(driver.vehicle_name.toLowerCase())
    )
  }

  const activeDrivers = allDrivers.filter(d => d.is_active && matchesSearch(d))
  const preferred = activeDrivers.filter(d => isVehicleMatch(d))
  const others = activeDrivers.filter(d => !isVehicleMatch(d))
  const allVisible = [...preferred, ...others]

  async function doAssign(driverId: string) {
    try {
      const result = await assignDriver.mutateAsync({ bookingId: booking.id, driverId, gpsTrackingEnabled: gpsEnabled })
      if (result?.date_conflict) {
        toast.warning(`Driver assigned — note: they also have booking ${result.date_conflict} on this date`)
      } else {
        toast.success(gpsEnabled ? 'Driver assigned — GPS tracking enabled' : 'Driver assigned — trip brief sent via WhatsApp')
      }
      onClose()
    } catch {
      toast.error('Failed to assign driver')
    }
    setConflictDriver(null)
  }

  function handleAssignClick(driver: Driver) {
    if (driver.status === 'on_duty') {
      setConflictDriver(driver)
    } else {
      doAssign(driver.id)
    }
  }

  const borderColor = (driver: Driver) => {
    if (driver.status === 'on_duty') return 'border-l-4 border-l-red-400'
    if (driver.status === 'available') return 'border-l-4 border-l-green-400'
    return 'border-l-4 border-l-gray-300'
  }

  const DriverRow = ({ driver }: { driver: Driver }) => (
    <div className={`p-3 rounded-lg border bg-white border-[#C3C5D7] ${borderColor(driver)}`}>
      {driver.status === 'on_duty' && (
        <div className="flex items-center gap-1 text-xs text-red-600 mb-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Conflict: Driver currently on duty
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-[#D4DCFF] text-[#1A56DB]">
            {driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </div>
          <div>
            <div className="font-medium text-sm text-[#191B23]">{driver.name}</div>
            <div className="text-xs text-[#434654]">
              {driver.vehicle_name} • {driver.vehicle_number} • {driver.seating_capacity} pax
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DriverStatusBadge status={driver.status} />
          <Button
            size="sm"
            className="rounded-sm text-xs h-7 bg-[#1A56DB] hover:bg-[#003FB1]"
            onClick={() => handleAssignClick(driver)}
            disabled={assignDriver.isPending}
          >
            Assign
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <Dialog open={open} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="w-5 h-5 text-[#1A56DB]" />
              Select Available Unit
            </DialogTitle>
            <div className="text-sm text-[#434654] flex items-center gap-2 mt-1">
              {booking.vehicle_type && (
                <span className="px-2 py-0.5 bg-[#D4DCFF] text-[#1A56DB] rounded-full text-xs font-medium">
                  {booking.vehicle_type}
                  {booking.pax_count ? ` • ${booking.pax_count} Pax` : ''}
                </span>
              )}
              <span>Booking: #{booking.booking_ref}</span>
            </div>
          </DialogHeader>

          <button
            type="button"
            onClick={() => setGpsEnabled(v => !v)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors mt-3 ${
              gpsEnabled
                ? 'border-[#1A56DB] bg-[#EEF2FF] text-[#1A56DB]'
                : 'border-[#C3C5D7] bg-white text-[#434654]'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              <Navigation className="w-4 h-4" />
              GPS Route Tracking
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gpsEnabled ? 'bg-[#1A56DB] text-white' : 'bg-[#ECEDF5] text-[#737686]'}`}>
              {gpsEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737686]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, vehicle type, vehicle name, or plate number…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#C3C5D7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB] focus:border-transparent"
            />
          </div>

          <div className="space-y-2 mt-2">
            {allVisible.length === 0 && (
              <p className="text-sm text-[#737686] py-4 text-center">
                {searchQuery.trim() ? 'No drivers match your search' : 'No active drivers found'}
              </p>
            )}
            {allVisible.map(driver => <DriverRow key={driver.id} driver={driver} />)}
          </div>

          <div className="text-xs text-[#737686] mt-2">
            {preferred.length} matching · {others.length} other{others.length !== 1 ? 's' : ''}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!conflictDriver}
        onOpenChange={o => !o && setConflictDriver(null)}
        title="Driver currently on duty"
        description={`${conflictDriver?.name} is currently on duty. Are you sure you want to assign them? Please confirm they are available.`}
        confirmLabel="Confirm Anyway"
        onConfirm={() => conflictDriver && doAssign(conflictDriver.id)}
        loading={assignDriver.isPending}
      />
    </>
  )
}
