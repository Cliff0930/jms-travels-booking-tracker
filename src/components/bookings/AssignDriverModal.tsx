'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { AlertTriangle, Car } from 'lucide-react'
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

  const eligible = allDrivers.filter(d =>
    d.is_active &&
    (!booking.vehicle_type || d.vehicle_type === booking.vehicle_type) &&
    (!booking.pax_count || d.seating_capacity >= booking.pax_count)
  )

  async function doAssign(driverId: string) {
    try {
      const result = await assignDriver.mutateAsync({ bookingId: booking.id, driverId })
      if (result?.date_conflict) {
        toast.warning(`Driver assigned — note: they also have booking ${result.date_conflict} on this date`)
      } else {
        toast.success('Driver assigned — trip brief sent via WhatsApp')
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

          <div className="space-y-2 mt-2">
            {eligible.length === 0 && (
              <p className="text-sm text-[#737686] py-4 text-center">No matching drivers found</p>
            )}
            {eligible.map(driver => (
              <div key={driver.id} className={`p-3 rounded-lg border border-[#C3C5D7] bg-white ${borderColor(driver)}`}>
                {driver.status === 'on_duty' && (
                  <div className="flex items-center gap-1 text-xs text-red-600 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Conflict: Driver currently on duty
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB]">
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
                      className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm text-xs h-7"
                      onClick={() => handleAssignClick(driver)}
                      disabled={assignDriver.isPending}
                    >
                      Assign
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-[#737686] mt-2">
            Showing {eligible.length} driver{eligible.length !== 1 ? 's' : ''} matching criteria
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
