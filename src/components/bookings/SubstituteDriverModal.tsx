'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { RefreshCw } from 'lucide-react'
import { useDrivers } from '@/hooks/useDrivers'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Booking, Driver } from '@/types'

interface SubstituteDriverModalProps {
  booking: Booking
  open: boolean
  onClose: () => void
}

export function SubstituteDriverModal({ booking, open, onClose }: SubstituteDriverModalProps) {
  const { data: allDrivers = [] } = useDrivers()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Driver | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const eligible = allDrivers.filter(d =>
    d.is_active &&
    d.id !== booking.driver_id &&
    (!booking.vehicle_type || d.vehicle_type === booking.vehicle_type) &&
    (!booking.pax_count || d.seating_capacity >= booking.pax_count)
  )

  async function handleConfirm() {
    if (!selected || !reason.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/substitute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_driver_id: selected.id, reason }),
      })
      if (!res.ok) throw new Error()
      qc.invalidateQueries({ queryKey: ['bookings', booking.id] })
      qc.invalidateQueries({ queryKey: ['booking-messages', booking.id] })
      toast.success('Driver substituted — client notified')
      onClose()
    } catch {
      toast.error('Failed to substitute driver')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-[#7E3AF2]" />
            Substitute Vehicle
          </DialogTitle>
          <p className="text-sm text-[#434654] mt-1">
            Replaces the current driver and notifies the client.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Select Replacement Driver</Label>
            <div className="space-y-2">
              {eligible.length === 0 && (
                <p className="text-sm text-[#737686] py-3 text-center">No eligible drivers available</p>
              )}
              {eligible.map(driver => (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => setSelected(driver)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selected?.id === driver.id
                      ? 'border-[#1A56DB] bg-[#EEF2FF]'
                      : 'border-[#C3C5D7] bg-white hover:bg-[#F3F3FE]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB]">
                        {driver.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <div className="font-medium text-sm text-[#191B23]">{driver.name}</div>
                        <div className="text-xs text-[#434654]">
                          {driver.vehicle_name} · {driver.vehicle_number} · {driver.seating_capacity} pax
                        </div>
                      </div>
                    </div>
                    <DriverStatusBadge status={driver.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Reason for substitution *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Vehicle breakdown, driver unavailable…"
              rows={2}
              className="border-[#C3C5D7] mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || !reason.trim() || loading}
            className="bg-[#7E3AF2] hover:bg-[#6C2BD9] rounded-sm"
          >
            {loading ? 'Substituting…' : 'Confirm Substitution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
