'use client'
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DriverStatusBadge } from '@/components/shared/StatusBadge'
import { RefreshCw, Search } from 'lucide-react'
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

  const activeDrivers = allDrivers.filter(d => d.is_active && d.id !== booking.driver_id && matchesSearch(d))
  const preferred = activeDrivers.filter(d => isVehicleMatch(d))
  const others = activeDrivers.filter(d => !isVehicleMatch(d))
  const allVisible = [...preferred, ...others]

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
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['bookings', booking.id] })
      qc.invalidateQueries({ queryKey: ['booking-messages', booking.id] })
      qc.invalidateQueries({ queryKey: ['drivers'] })
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
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737686]" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, vehicle type, vehicle name, or plate number…"
                className="w-full pl-9 pr-3 py-2 text-sm border border-[#C3C5D7] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1A56DB] focus:border-transparent"
              />
            </div>
            <div className="space-y-2">
              {allVisible.length === 0 && (
                <p className="text-sm text-[#737686] py-3 text-center">
                  {searchQuery.trim() ? 'No drivers match your search' : 'No active drivers available'}
                </p>
              )}
              {allVisible.map(driver => (
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

        <div className="text-xs text-[#737686]">
          {preferred.length} matching · {others.length} other{others.length !== 1 ? 's' : ''}
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
