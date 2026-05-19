'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { MapPin, Send, CheckCircle2, ArrowRight, User } from 'lucide-react'
import { toast } from 'sonner'
import type { BookingLeg, Driver } from '@/types'

interface LegsDueItem {
  leg: BookingLeg & { driver?: Driver | null }
  booking: {
    id: string
    booking_ref: string
    status: string
    trip_type: string
    total_days: number
    pickup_location: string | null
    drop_location: string | null
    pickup_date: string | null
    guest_name: string | null
    guest_phone: string | null
    client?: { id: string; name: string; primary_phone: string | null } | null
    company?: { id: string; name: string } | null
    driver?: Driver | null
  }
}

function legTypeLabel(tripType: string, dayNumber: number) {
  if (tripType === 'airport' && dayNumber === 1) return { label: 'Airport Pickup', cls: 'bg-amber-100 text-amber-700' }
  if (tripType === 'airport') return { label: 'Local', cls: 'bg-[#ECFDF5] text-[#065F46]' }
  if (tripType === 'local') return { label: 'Local', cls: 'bg-[#ECFDF5] text-[#065F46]' }
  return null
}

export function LegsDueCard({ item, legsDate }: { item: LegsDueItem; legsDate: string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [sending, setSending] = useState(false)
  const { leg, booking } = item

  const travellerName = booking.guest_name || booking.client?.name || 'Unknown'
  const companyName = booking.company?.name
  const linkSentAt = leg.link_sent_at
    ? new Date(leg.link_sent_at).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      })
    : null
  const typeTag = legTypeLabel(booking.trip_type, leg.day_number)

  async function handleSendLinks() {
    setSending(true)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/legs/${leg.id}/send-links`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Day ${leg.day_number} links sent`)
      qc.invalidateQueries({ queryKey: ['legs-due', legsDate] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send links')
    } finally {
      setSending(false)
    }
  }

  const hasDriver = !!(leg.driver_id || booking.driver)
  const driverInfo = leg.driver || booking.driver

  return (
    <div
      className={`bg-white rounded-lg border overflow-hidden ${!linkSentAt ? 'border-amber-300' : 'border-[#E5E7EB]'}`}
    >
      <div className="p-3.5 flex items-start gap-3">
        {/* Day circle */}
        <div className="w-9 h-9 rounded-full bg-[#D4DCFF] flex items-center justify-center text-sm font-bold text-[#1A56DB] shrink-0 mt-0.5">
          {leg.day_number}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: booking ref + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-[#191B23] text-sm">{booking.booking_ref}</span>
            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
              leg.leg_status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-[#EDEDF8] text-[#434654]'
            }`}>
              {leg.leg_status.replace('_', ' ')}
            </span>
            {typeTag && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${typeTag.cls}`}>{typeTag.label}</span>
            )}
            {companyName && (
              <span className="px-1.5 py-0.5 rounded-full text-xs bg-[#EDEDF8] text-[#434654]">{companyName}</span>
            )}
          </div>

          {/* Row 2: traveller + location */}
          <div className="flex items-center gap-1.5 mt-1 text-sm text-[#434654]">
            <User className="w-3.5 h-3.5 shrink-0 text-[#9CA3AF]" />
            <span className="font-medium text-[#191B23]">{travellerName}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-[#737686]">
            <MapPin className="w-3 h-3 shrink-0 text-[#9CA3AF]" />
            <span className="truncate">
              {booking.pickup_location || '—'}
              {booking.drop_location && <> → {booking.drop_location}</>}
            </span>
          </div>

          {/* Row 3: driver info */}
          {driverInfo ? (
            <div className="mt-1 text-xs text-[#737686]">
              Driver: <span className="text-[#434654] font-medium">{driverInfo.name}</span>
              {driverInfo.vehicle_name && <> · {driverInfo.vehicle_name}</>}
              {driverInfo.vehicle_number && <> · {driverInfo.vehicle_number}</>}
            </div>
          ) : (
            <div className="mt-1 text-xs text-amber-600">No driver assigned</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {linkSentAt ? (
            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded whitespace-nowrap">
              <CheckCircle2 className="w-3 h-3" />
              Sent · {linkSentAt}
            </span>
          ) : (
            <span className="text-xs text-amber-600 font-medium">Links not sent</span>
          )}

          <div className="flex items-center gap-1.5">
            {hasDriver && (
              <Button
                size="sm"
                variant="outline"
                className={`h-7 text-xs px-2.5 rounded-sm gap-1 ${
                  linkSentAt
                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                    : 'border-[#1A56DB] text-[#1A56DB] hover:bg-[#EEF2FF]'
                }`}
                onClick={handleSendLinks}
                disabled={sending}
              >
                <Send className="w-3 h-3" />
                {sending ? 'Sending…' : linkSentAt ? 'Resend' : `Day ${leg.day_number} Links`}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2.5 rounded-sm border-[#C3C5D7] text-[#434654] hover:bg-[#F3F3FE]"
              onClick={() => router.push(`/bookings/${booking.id}`)}
            >
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
