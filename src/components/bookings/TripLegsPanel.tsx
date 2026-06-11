'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDrivers } from '@/hooks/useDrivers'
import { Calendar, User, Send, CheckCircle2, Bell } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils/date'
import type { BookingLeg, Driver } from '@/types'

interface TripLegsPanelProps {
  bookingId: string
  driverAssigned?: boolean
  tripType?: string
}

function legStatusColor(status: string) {
  if (status === 'completed') return 'bg-green-100 text-green-700'
  if (status === 'in_progress') return 'bg-blue-100 text-blue-700'
  return 'bg-[#EDEDF8] text-[#434654]'
}

export function TripLegsPanel({ bookingId, driverAssigned = false, tripType }: TripLegsPanelProps) {
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
      qc.invalidateQueries({ queryKey: ['booking-legs', bookingId] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send links')
    } finally {
      setSendingLinks(null)
    }
  }

  const [notifying, setNotifying] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function handleNotifyClient() {
    setNotifying(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/legs/notify-client`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Client notified of driver update')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to notify client')
    } finally {
      setNotifying(false)
    }
  }

  async function handleGenerateLegs() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/legs`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      qc.invalidateQueries({ queryKey: ['booking-legs', bookingId] })
      toast.success('Legs generated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate legs')
    } finally {
      setGenerating(false)
    }
  }

  if (isLoading) return <p className="text-sm text-[#737686]">Loading legs…</p>
  if (legs.length === 0) return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-[#737686]">No legs found.</p>
      <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 rounded-sm" onClick={handleGenerateLegs} disabled={generating}>
        {generating ? 'Generating…' : 'Generate Legs'}
      </Button>
    </div>
  )

  const anyDriverAssigned = legs.some(l => l.driver_id)

  return (
    <div className="space-y-2">
      {legs.map(leg => {
        const hasDriver = !!(leg.driver_id || driverAssigned)
        const isCompleted = leg.leg_status === 'completed'
        const linkSentAt = leg.link_sent_at
          ? new Date(leg.link_sent_at).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })
          : null
        return (
          <div key={leg.id} className="p-3 rounded-lg border border-[#C3C5D7] bg-[#F9F9FE]">
            {/* Top row: day circle + info */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-bold text-[#1A56DB] shrink-0 mt-0.5">
                {leg.day_number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Calendar className="w-3.5 h-3.5 text-[#737686] shrink-0" />
                  <span className="text-sm font-medium text-[#191B23] whitespace-nowrap">
                    {formatDate(leg.leg_date)}
                  </span>
                  <Badge className={`text-xs px-1.5 py-0 capitalize ${legStatusColor(leg.leg_status)}`}>
                    {leg.leg_status.replace('_', ' ')}
                  </Badge>
                  {tripType === 'airport' && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${leg.day_number === 1 ? 'bg-amber-100 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                      {leg.day_number === 1 ? 'Airport Pickup' : 'Local'}
                    </span>
                  )}
                  {tripType === 'local' && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[#ECFDF5] text-[#065F46]">Local</span>
                  )}
                </div>
                {leg.driver ? (
                  <div className="flex items-center gap-1 text-xs text-[#434654]">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{leg.driver.name} · {leg.driver.vehicle_name} · {leg.driver.vehicle_number}</span>
                  </div>
                ) : (
                  <p className="text-xs text-amber-600">No driver assigned</p>
                )}
                {linkSentAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded mt-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    Link sent · {linkSentAt}
                  </span>
                )}
              </div>
            </div>
            {/* Actions row: below info, indented to align with content */}
            <div className="flex items-center gap-2 mt-2 pl-11">
              {hasDriver && !isCompleted && (
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs px-2 rounded-sm gap-1 shrink-0 ${linkSentAt ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-[#1A56DB] text-[#1A56DB] hover:bg-[#EEF2FF]'}`}
                  onClick={() => handleSendLinks(leg)}
                  disabled={sendingLinks === leg.id}
                >
                  <Send className="w-3 h-3" />
                  {sendingLinks === leg.id ? 'Sending…' : linkSentAt ? 'Resend' : `Day ${leg.day_number} Links`}
                </Button>
              )}
              <Select
                value={leg.driver_id || ''}
                items={allDrivers.filter(d => d.is_active).map(d => ({ value: d.id, label: `${d.name} (${d.vehicle_type})` }))}
                onValueChange={v => v !== null && v !== '' && handleAssign(leg.id, v)}
              >
                <SelectTrigger className="flex-1 h-7 text-xs border-[#C3C5D7]" disabled={assigning === leg.id}>
                  <SelectValue placeholder="Assign driver…" />
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
      {anyDriverAssigned && (
        <div className="pt-1">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 text-xs gap-1.5 border-[#C3C5D7] text-[#434654] hover:border-[#1A56DB] hover:text-[#1A56DB]"
            onClick={handleNotifyClient}
            disabled={notifying}
          >
            <Bell className="w-3.5 h-3.5" />
            {notifying ? 'Sending…' : 'Notify Client of Driver Update'}
          </Button>
        </div>
      )}
    </div>
  )
}
