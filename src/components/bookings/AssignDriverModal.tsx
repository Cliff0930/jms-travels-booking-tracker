'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { AlertTriangle, Car, Navigation } from 'lucide-react'
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
  const [mismatchDriver, setMismatchDriver] = useState<Driver | null>(null)
  const [gpsEnabled, setGpsEnabled] = useState(false)

  function getMismatchReasons(driver: Driver): string[] {
    const reasons: string[] = []
    if (booking.vehicle_type && driver.vehicle_type !== booking.vehicle_type) {
      reasons.push(`Vehicle: ${driver.vehicle_type || 'unknown'} (needs ${booking.vehicle_type})`)
    }
    if (booking.pax_count && driver.seating_capacity < booking.pax_count) {
      reasons.push(`Capacity: ${driver.seating_capacity} seats (needs ${booking.pax_count})`)
    }
    return reasons
  }

  const activeDrivers = allDrivers.filter(d => d.is_active)
  const eligible = activeDrivers.filter(d => getMismatchReasons(d).length === 0)
  const ineligible = activeDrivers.filter(d => getMismatchReasons(d).length > 0)

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
    setMismatchDriver(null)
  }

  function handleAssignClick(driver: Driver, hasMismatch = false) {
    if (hasMismatch) {
      setMismatchDriver(driver)
    } else if (driver.status === 'on_duty') {
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

  const DriverRow = ({ driver, hasMismatch = false }: { driver: Driver; hasMismatch?: boolean }) => {
    const mismatchReasons = getMismatchReasons(driver)
    return (
      <div key={driver.id} className={`p-3 rounded-lg border bg-white ${hasMismatch ? 'border-amber-200 opacity-80' : `border-[#C3C5D7] ${borderColor(driver)}`}`}>
        {driver.status === 'on_duty' && !hasMismatch && (
          <div className="flex items-center gap-1 text-xs text-red-600 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Conflict: Driver currently on duty
          </div>
        )}
        {hasMismatch && (
          <div className="flex items-center gap-1 text-xs text-amber-600 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {mismatchReasons.join(' • ')}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${hasMismatch ? 'bg-amber-100 text-amber-700' : 'bg-[#D4DCFF] text-[#1A56DB]'}`}>
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
              className={`rounded-sm text-xs h-7 ${hasMismatch ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#1A56DB] hover:bg-[#003FB1]'}`}
              onClick={() => handleAssignClick(driver, hasMismatch)}
              disabled={assignDriver.isPending}
            >
              Assign
            </Button>
          </div>
        </div>
      </div>
    )
  }

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

          <div className="space-y-2 mt-2">
            {eligible.length === 0 && ineligible.length === 0 && (
              <p className="text-sm text-[#737686] py-4 text-center">No active drivers found</p>
            )}
            {eligible.map(driver => <DriverRow key={driver.id} driver={driver} />)}

            {ineligible.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="flex-1 h-px bg-amber-200" />
                  <span className="text-xs text-amber-600 font-medium whitespace-nowrap">Does not match criteria</span>
                  <div className="flex-1 h-px bg-amber-200" />
                </div>
                {ineligible.map(driver => <DriverRow key={driver.id} driver={driver} hasMismatch />)}
              </>
            )}
          </div>

          <div className="text-xs text-[#737686] mt-2">
            {eligible.length} matching · {ineligible.length} mismatched
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
      <ConfirmDialog
        open={!!mismatchDriver}
        onOpenChange={o => !o && setMismatchDriver(null)}
        title="Vehicle does not match booking requirements"
        description={`${mismatchDriver?.name}'s vehicle does not meet the booking criteria: ${mismatchDriver ? getMismatchReasons(mismatchDriver).join(', ') : ''}. Assign anyway?`}
        confirmLabel="Assign Anyway"
        onConfirm={() => mismatchDriver && doAssign(mismatchDriver.id)}
        loading={assignDriver.isPending}
      />
    </>
  )
}
