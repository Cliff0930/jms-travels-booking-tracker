'use client'
import { useRouter } from 'next/navigation'
import { MapPin, Calendar, Clock, MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { BookingStatusBadge, statusBarClass } from '@/components/shared/StatusBadge'
import { FlagList } from '@/components/shared/FlagBadge'
import { formatBookingDateTime, formatTimestamp } from '@/lib/utils/date'
import type { Booking } from '@/types'

interface BookingCardProps {
  booking: Booking
  onConfirm?: (id: string) => void
  onCancel?: (id: string) => void
  onAssign?: (booking: Booking) => void
}

export function BookingCard({ booking, onConfirm, onCancel, onAssign }: BookingCardProps) {
  const router = useRouter()
  const clientName = booking.guest_name || booking.client?.name || 'Unknown'
  const companyName = booking.company?.name

  return (
    <div
      className={`bg-white rounded-lg border border-[#E5E7EB] overflow-hidden card-hover cursor-pointer ${statusBarClass(booking.status)}`}
      onClick={() => router.push(`/bookings/${booking.id}`)}
    >
      {/* Main content */}
      <div className="p-4">
        {/* Row 1: ref + trip type + status + menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span className="font-semibold text-[#191B23] text-sm">{booking.booking_ref}</span>
            {booking.trip_type === 'local' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#ECFDF5] text-[#065F46]">Local</span>
            )}
            {booking.trip_type === 'outstation' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#EDE9FE] text-[#7E3AF2]">Outstation</span>
            )}
            {booking.trip_type === 'airport' && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF3C7] text-[#92400E]">Airport</span>
            )}
            <BookingStatusBadge status={booking.status} />
          </div>

          <div onClick={e => e.stopPropagation()} className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-[#EDEDF8] transition-colors text-[#9CA3AF] hover:text-[#434654]"
                aria-label="Booking actions"
              >
                <MoreVertical className="w-4 h-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push(`/bookings/${booking.id}`)}>
                  View Detail
                </DropdownMenuItem>
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

        {/* Row 2: client name + company + VIP */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <span className="text-sm font-medium text-[#191B23]">{clientName}</span>
          {companyName && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-[#EDEDF8] text-[#434654]">{companyName}</span>
          )}
          {booking.client?.is_vip && (
            <span className="px-1.5 py-0.5 rounded-full text-xs bg-[#FEF9C3] text-[#713F12] font-semibold">VIP</span>
          )}
        </div>

        {/* Row 3: pickup → drop */}
        <div className="flex items-center gap-1.5 mt-2 text-sm text-[#434654]">
          <MapPin className="w-3.5 h-3.5 shrink-0 text-[#9CA3AF]" />
          <span className="truncate">
            {booking.pickup_location || <span className="text-amber-600">No pickup</span>}
            {booking.drop_location && <> → {booking.drop_location}</>}
          </span>
        </div>

        {/* Row 4: date/time */}
        <div className="flex items-center gap-1.5 mt-1 text-sm text-[#434654]">
          <Calendar className="w-3.5 h-3.5 shrink-0 text-[#9CA3AF]" />
          <span>{formatBookingDateTime(booking.pickup_date, booking.pickup_time)}</span>
        </div>
      </div>

      {/* Footer strip */}
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
