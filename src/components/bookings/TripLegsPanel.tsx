'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDrivers } from '@/hooks/useDrivers'
import { Calendar, User, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { BookingLeg, Driver } from '@/types'

interface TripLegsPanelProps {
  bookingId: string
  driverAssigned?: boolean
}

function legStatusColor(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700'
  return 'bg-[#EDEDF8] text-[#434654]'
}

export function TripLegsPanel({ bookingId, driverAssigned = false }: TripLegsPanelProps) {
  const qc = useQueryClient()
  const { data: legs = [], isLoading } = useQuery<(BookingLeg & { driver?: Driver | null })[]>({
    queryKey: ['booking-legs', bookingId],
    queryFn: () => fetch(`/api/bookings/${bookingId}/legs`).then(r => r.json()),
  })
  const { data: allDrivers = [] } = useDrivers()
  const [assigning, setAssigning] = useState<string | null>(null)
  const [sendingLinks, setSendingLinks] = useState<string | null>(null)

  const updateLeg = useMutation({
    mutationFn: ({ legId, driver_id }: { legId: string; driver_id: string }) =>
      fetch(`/api/bookings/${bookingId}/legs/${legId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driver_id }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking-legs', bookingId] }),
  })

  async function handleAssign(legId: string, driverId: string) {
    setAssigning(legId)
    try {
      await updateLeg.mutateAsync({ legId, driver_id: driverId })
      toast.success('Driver assigned to leg')
    } catch {
      toast.error('Failed to assign driver')
    } finally {
      setAssigning(null)
    }
  }

  async function handleSendLinks(leg: BookingLeg & { driver?: Driver | null }) {
    setSendingLinks(leg.id)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/legs/${leg.id}/send-links`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Day ${leg.day_number} links sent to driver`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send links')
    } finally {
      setSendingLinks(null)
    }
  }

  if (isLoading) return <p className="text-sm text-[#737686]">Loading legs…</p>
  if (legs.length === 0) return <p className="text-sm text-[#737686]">No legs found. Confirm the booking to generate legs.</p>

  return (
    <div className="space-y-2">
      {legs.map(leg => {
        const hasDriver = !!(leg.driver_id || driverAssigned)
        const isCompleted = leg.leg_status === 'completed'
        return (
          <div key={leg.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#C3C5D7] bg-[#F9F9FE]">
            <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-bold text-[#1A56DB] shrink-0">
              {leg.day_number}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-3.5 h-3.5 text-[#737686]" />
                <span className="text-sm font-medium text-[#191B23]">
                  {new Date(leg.leg_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <Badge className={`text-xs px-1.5 py-0 capitalize ${legStatusColor(leg.leg_status)}`}>
                  {leg.leg_status.replace('_', ' ')}
                </Badge>
              </div>
              {leg.driver ? (
                <div className="flex items-center gap-1 text-xs text-[#434654]">
                  <User className="w-3 h-3" />
                  {leg.driver.name} · {leg.driver.vehicle_name} · {leg.driver.vehicle_number}
                </div>
              ) : (
                <p className="text-xs text-amber-600">No driver assigned</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasDriver && !isCompleted && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2 rounded-sm gap-1 border-[#1A56DB] text-[#1A56DB] hover:bg-[#EEF2FF]"
                  onClick={() => handleSendLinks(leg)}
                  disabled={sendingLinks === leg.id}
                >
                  <Send className="w-3 h-3" />
                  {sendingLinks === leg.id ? 'Sending…' : `Day ${leg.day_number} Links`}
                </Button>
              )}
              <Select
                value={leg.driver_id || ''}
                onValueChange={v => v !== null && v !== '' && handleAssign(leg.id, v)}
              >
                <SelectTrigger className="w-36 h-7 text-xs border-[#C3C5D7]" disabled={assigning === leg.id}>
                  <SelectValue placeholder="Assign…" />
                </SelectTrigger>
                <SelectContent>
                  {allDrivers.filter(d => d.is_active).map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.vehicle_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )
      })}
    </div>
  )
}
