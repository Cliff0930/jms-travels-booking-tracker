'use client'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { Phone, Mail, Car, Users } from 'lucide-react'
import type { Driver } from '@/types'

interface DriverDetailPanelProps {
  driver: Driver | null
  open: boolean
  onClose: () => void
  onDeactivate?: (id: string) => void
}

export function DriverDetailPanel({ driver, open, onClose, onDeactivate }: DriverDetailPanelProps) {
  if (!driver) return null
  const initials = driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent className="w-full sm:w-[400px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[#D4DCFF] flex items-center justify-center text-lg font-semibold text-[#1A56DB]">
              {initials}
            </div>
            <div>
              <SheetTitle className="text-[#191B23]">{driver.name}</SheetTitle>
              <DriverStatusBadge status={driver.status} className="mt-1" />
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <section>
            <h3 className="text-label-caps text-[#737686] mb-2">Contact</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#191B23]">
                <Phone className="w-4 h-4 text-[#737686]" />
                {driver.phone}
              </div>
              {driver.email && (
                <div className="flex items-center gap-2 text-sm text-[#191B23]">
                  <Mail className="w-4 h-4 text-[#737686]" />
                  {driver.email}
                </div>
              )}
            </div>
          </section>

          <Separator />

          <section>
            <h3 className="text-label-caps text-[#737686] mb-2">Vehicle Details</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-[#191B23]">
                <Car className="w-4 h-4 text-[#737686]" />
                {driver.vehicle_name}
                <span className="px-1.5 py-0.5 bg-[#EDEDF8] rounded text-xs text-[#434654]">{driver.vehicle_type}</span>
              </div>
              <div className="text-sm text-[#434654]">Plate: <span className="font-medium text-[#191B23]">{driver.vehicle_number}</span></div>
              {driver.vehicle_color && <div className="text-sm text-[#434654]">Color: <span className="font-medium text-[#191B23]">{driver.vehicle_color}</span></div>}
              <div className="flex items-center gap-2 text-sm text-[#434654]">
                <Users className="w-4 h-4 text-[#737686]" />
                {driver.seating_capacity} passengers
              </div>
            </div>
          </section>

          {driver.is_active && onDeactivate && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full text-red-600 border-red-200 hover:bg-red-50 rounded-sm"
                onClick={() => onDeactivate(driver.id)}
              >
                Deactivate Driver
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
