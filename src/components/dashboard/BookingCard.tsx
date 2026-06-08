'use client'
import { useRouter } from 'next/navigation'
import { MapPin, Clock, MoreVertical, User, Car, MessageCircle, Mail, Pencil, Upload } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { BookingStatusBadge, statusBarClass } from '@/components/shared/StatusBadge'
import { FlagList } from '@/components/shared/FlagBadge'
import { formatBookingDateTime, formatTimestamp } from '@/lib/utils/date'
import type { Booking } from '@/types'

export const SOURCE_CONFIG = {
  whatsapp: { Icon: MessageCircle, label: 'WA',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  email:    { Icon: Mail,          label: 'Email',   cls: 'bg-blue-50   text-blue-700   border-blue-200'   },
  manual:   { Icon: Pencil,        label: 'Manual',  cls: 'bg-gray-100  text-gray-600   border-gray-200'   },
  upload:   { Icon: Upload,        label: 'Upload',  cls: 'bg-purple-50 text-purple-700 border-purple-200' },
} as const

export function getCountdown(
  pickup_date: string | null,
  pickup_time: string | null,
): { label: string; cls: string; pulse: boolean } | null {
  if (!pickup_date) return null
  const now      = Date.now()
  const pickupMs = new Date(`${pickup_date}T${pickup_time || '00:00'}`).getTime()
  const diffMs   = pickupMs - now
  const diffMin  = Math.floor(diffMs / 60000)

  if (diffMin < -60) return null
  if (diffMin < 0)   return { label: 'Underway', cls: 'bg-gray-100 text-gray-500', pulse: false }
  if (diffMin < 60)  return { label: `${diffMin}m`, cls: 'bg-red-50 text-red-700 border border-red-200', pulse: true }
  if (diffMin < 120) return { label: `${Math.floor(diffMin / 60)}h ${diffMin % 60}m`, cls: 'bg-red-50 text-red-700 border border-red-200', pulse: true }
  if (diffMin < 360) return { label: `${Math.floor(diffMin / 60)}h away`, cls: 'bg-amber-50 text-amber-700 border border-amber-200', pulse: false }

  const today = new Date().toISOString().slice(0, 10)
  const tmr   = new Date(now + 86400000).toISOString().slice(0, 10)
  if (pickup_date === today) return { label: 'Today',    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', pulse: false }
  if (pickup_date === tmr)   return { label: 'Tomorrow', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', pulse: false }
  return null
}

interface BookingCardProps {
  booking: Booking
  onConfirm?: (id: string) => void
  onCancel?: (id: string) => void
  onAssign?: (booking: Booking) => void
}

export function BookingCard({ booking, onConfirm, onCancel, onAssign }: BookingCardProps) {
  const router = useRouter()
  const travellerName = booking.guest_name || booking.client?.name || 'Unknown'
  const bookerName    = booking.guest_name && booking.client?.name ? booking.client.name : null
  const companyName   = booking.company?.name || booking.client?.company?.name
  const isPossibleDup = (booking.flags as string[] | undefined)?.includes('possible_duplicate')
  const isOfflineTrip = (booking.flags as string[] | undefined)?.includes('offline_trip')

  const src      = SOURCE_CONFIG[booking.source as keyof typeof SOURCE_CONFIG] ?? SOURCE_CONFIG.manual
  const SrcIcon  = src.Icon
  const countdown = getCountdown(booking.pickup_date, booking.pickup_time)
  const urgent   = booking.status === 'confirmed' && !booking.driver_id && !!countdown?.pulse

  return (
    <div
      className={`bg-white rounded-xl border overflow-hidden cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-px ${isPossibleDup ? 'border-amber-400' : 'border-[#E5E7EB]'} ${statusBarClass(booking.status)}`}
      onClick={() => router.push(`/bookings/${booking.id}`)}
    >
      <div className="p-4">
        {/* Row 1: source chip + ref + trip/flag badges + status pill — ⋮ alone on right */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0 ${src.cls}`}>
              <SrcIcon className="w-2.5 h-2.5" />{src.label}
            </span>
            <span className="font-bold text-[#191B23] text-sm">{booking.booking_ref}</span>
            {urgent && (
              <span className="relative flex h-2 w-2 shrink-0" title="Needs driver — pickup soon">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
            {isPossibleDup && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-300">Dup?</span>}
            {booking.trip_type === 'local'      && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700">Local</span>}
            {booking.trip_type === 'outstation' && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">Outstation</span>}
            {booking.trip_type === 'airport'    && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">Airport</span>}
            {isOfflineTrip && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700">Offline</span>}
            {booking.is_settlement_duty && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-400">₹ SETTLE</span>}
            <BookingStatusBadge status={booking.status} />
          </div>
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-[#EDEDF8] transition-colors text-[#9CA3AF] hover:text-[#434654]"
                aria-label="Booking actions"
              >
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/bookings/${booking.id}`)}>View Detail</DropdownMenuItem>
                {(booking.status === 'draft' || booking.status === 'pending_approval') && onConfirm && (
                  <DropdownMenuItem onClick={() => onConfirm(booking.id)}>Confirm</DropdownMenuItem>
                )}
                {booking.status !== 'completed' && booking.status !== 'cancelled' && onCancel && (
                  <DropdownMenuItem onClick={() => onCancel(booking.id)} className="text-red-600">Cancel</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Single-column body */}
        <div className="mt-3 space-y-1.5 min-w-0">
          {/* Traveller + company + type */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-[#191B23]">{travellerName}</span>
            {companyName && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EDEDF8] text-[#434654]">{companyName}</span>}
            {booking.client?.is_vip && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700">VIP</span>}
            {booking.booking_type === 'company'  && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">Corp</span>}
            {booking.booking_type === 'personal' && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700">Personal</span>}
          </div>
          {bookerName && (
            <div className="flex items-center gap-1 text-xs text-[#9CA3AF]">
              <User className="w-3 h-3 shrink-0" />
              <span>Booked by {bookerName}</span>
            </div>
          )}
          {/* Route */}
          <div className="flex items-start gap-1 text-sm text-[#434654]">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-[#9CA3AF] mt-0.5" />
            <span className="line-clamp-2 leading-snug">
              {booking.pickup_location ?? <span className="text-amber-600 text-xs">No pickup set</span>}
              {booking.drop_location && <span className="text-[#9CA3AF]"> → {booking.drop_location}</span>}
            </span>
          </div>
          {/* Countdown + date/time */}
          <div className="flex items-center gap-2 flex-wrap">
            {countdown && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${countdown.cls}`}>
                {countdown.pulse && (
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-600" />
                  </span>
                )}
                {countdown.label}
              </span>
            )}
            <span className="text-xs text-[#6B7280]">{formatBookingDateTime(booking.pickup_date, booking.pickup_time)}</span>
          </div>
          {/* Driver */}
          {booking.driver && (
            <div className="flex items-center gap-1">
              <Car className="w-3 h-3 text-[#059669] shrink-0" />
              <span className="text-xs font-medium text-[#059669]">{booking.driver.name}</span>
              <span className="text-[10px] text-[#9CA3AF] font-mono">{booking.driver.vehicle_number}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-t border-[#F3F4F6] bg-[#F9FAFB]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-1.5 text-xs text-[#9CA3AF]">
          <Clock className="w-3 h-3 shrink-0" />
          <span>Received {formatTimestamp(booking.created_at)}</span>
        </div>
        <div className="flex items-center gap-2">
          {booking.flags?.length > 0 && <FlagList flags={booking.flags} />}
          {booking.status === 'confirmed' && !booking.driver_id && onAssign && (
            <Button
              size="sm"
              className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm text-xs h-7 px-2.5"
              onClick={() => onAssign(booking)}
            >
              Assign Driver
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
