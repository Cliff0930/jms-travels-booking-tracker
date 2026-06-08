'use client'
import { useRouter } from 'next/navigation'
import { MapPin, Car, MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { BookingStatusBadge, statusBarClass } from '@/components/shared/StatusBadge'
import { formatBookingDateTime } from '@/lib/utils/date'
import { getCountdown, SOURCE_CONFIG } from './BookingCard'
import type { Booking } from '@/types'

interface Props {
  booking: Booking
  onConfirm?: (id: string) => void
  onCancel?: (id: string) => void
  onAssign?: (booking: Booking) => void
}

export function BookingListRow({ booking, onConfirm, onCancel, onAssign }: Props) {
  const router        = useRouter()
  const travellerName = booking.guest_name || booking.client?.name || 'Unknown'
  const companyName   = booking.company?.name || booking.client?.company?.name
  const countdown     = getCountdown(booking.pickup_date, booking.pickup_time)
  const src           = SOURCE_CONFIG[booking.source as keyof typeof SOURCE_CONFIG] ?? SOURCE_CONFIG.manual
  const SrcIcon       = src.Icon
  const isPossibleDup = (booking.flags as string[] | undefined)?.includes('possible_duplicate')
  const urgent        = booking.status === 'confirmed' && !booking.driver_id && !!countdown?.pulse

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-[#F3F4F6] last:border-b-0 hover:bg-[#F9FAFB] cursor-pointer transition-colors group ${statusBarClass(booking.status)} ${isPossibleDup ? 'bg-amber-50/40' : ''}`}
      onClick={() => router.push(`/bookings/${booking.id}`)}
    >
      {/* Ref + source */}
      <div className="w-[100px] sm:w-[160px] flex items-center gap-1.5 shrink-0">
        <span className={`inline-flex items-center px-1 py-0.5 rounded border text-[9px] font-bold ${src.cls}`}>
          <SrcIcon className="w-2.5 h-2.5" />
        </span>
        <span className="text-xs font-semibold text-[#191B23]">{booking.booking_ref}</span>
        {urgent && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
          </span>
        )}
        {booking.is_settlement_duty && <span className="text-[9px] font-bold text-amber-700">₹</span>}
      </div>

      {/* Traveller */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[#191B23] truncate">{travellerName}</span>
          {companyName && <span className="hidden sm:inline px-1 py-0.5 rounded text-[9px] bg-[#EDEDF8] text-[#434654] font-medium shrink-0">{companyName}</span>}
          {booking.client?.is_vip && <span className="text-[9px] font-bold text-amber-600 shrink-0">VIP</span>}
        </div>
        {booking.driver && (
          <div className="flex items-center gap-1 mt-0.5 lg:hidden">
            <Car className="w-3 h-3 text-[#059669] shrink-0" />
            <span className="text-[10px] text-[#059669] font-medium truncate">{booking.driver.name}</span>
            {booking.driver.vehicle_number && (
              <span className="text-[10px] text-[#9CA3AF] font-mono shrink-0">{booking.driver.vehicle_number}</span>
            )}
          </div>
        )}
      </div>

      {/* Route */}
      <div className="flex-1 min-w-0 hidden md:flex items-center gap-1">
        <MapPin className="w-3 h-3 shrink-0 text-[#9CA3AF]" />
        <span className="text-xs text-[#6B7280] truncate">
          {booking.pickup_location ?? '—'}
          {booking.drop_location && <span className="text-[#C3C5D7]"> → {booking.drop_location}</span>}
        </span>
      </div>

      {/* Date + countdown */}
      <div className="w-[140px] shrink-0 hidden sm:flex flex-col items-end gap-0.5">
        <span className="text-xs text-[#6B7280]">{formatBookingDateTime(booking.pickup_date, booking.pickup_time)}</span>
        {countdown && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${countdown.cls}`}>{countdown.label}</span>
        )}
      </div>

      {/* Driver */}
      <div className="w-[120px] shrink-0 hidden lg:flex items-center gap-1">
        {booking.driver ? (
          <>
            <Car className="w-3 h-3 text-[#059669] shrink-0" />
            <span className="text-xs text-[#059669] font-medium truncate">{booking.driver.name}</span>
          </>
        ) : (
          <span className="text-xs text-[#D1D5DB] italic">No driver</span>
        )}
      </div>

      {/* Status */}
      <div className="w-[110px] shrink-0 flex justify-end">
        <BookingStatusBadge status={booking.status} />
      </div>

      {/* Actions */}
      <div className="w-10 shrink-0 flex justify-end" onClick={e => e.stopPropagation()}>
        {booking.status === 'confirmed' && !booking.driver_id && onAssign ? (
          <Button size="sm" className="bg-[#1A56DB] rounded-sm text-[10px] h-6 px-2" onClick={() => onAssign(booking)}>
            Assign
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#EDEDF8] transition-all text-[#9CA3AF]"
              aria-label="Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
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
        )}
      </div>
    </div>
  )
}
