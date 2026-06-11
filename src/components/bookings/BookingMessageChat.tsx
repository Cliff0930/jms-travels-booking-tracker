'use client'
import { useState } from 'react'
import { Mail, MessageCircle, CheckCircle, XCircle, Users, User, Car } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils/date'
import type { Booking, MessageLog } from '@/types'

const TEMPLATE_LABELS: Record<string, string> = {
  booking_received:         'Booking Received',
  missing_info_request:     'Missing Info Request',
  approval_request:         'Approval Request',
  approval_chase:           'Approval Chase',
  verbal_approval_ack:      'Verbal Approval Ack',
  booking_confirmed:        'Booking Confirmed',
  driver_details_to_client: 'Driver Details',
  trip_brief_to_driver:     'Trip Brief',
  cancellation_client:      'Cancellation (Client)',
  cancellation_driver:      'Cancellation (Driver)',
  leg_removed_driver:       'Leg Removed (Driver)',
  substitute_vehicle_client:'Substitute Vehicle',
}

type ContactTab = 'all' | 'booker' | 'guest' | 'driver'

function norm(s: string | null | undefined) {
  return s?.replace(/\D/g, '') ?? ''
}

function assignTab(msg: MessageLog, booking: Booking): ContactTab {
  const clientPhone = norm(booking.client?.primary_phone)
  const clientEmail = booking.client?.primary_email?.toLowerCase() ?? ''
  const guestPhone  = norm(booking.guest_phone)

  if (msg.driver_id) return 'driver'
  if (msg.client_id && msg.client_id === booking.client_id) return 'booker'

  const recipNorm  = norm(msg.recipient)
  const senderNorm = norm(msg.sender)
  const recipLower = msg.recipient?.toLowerCase() ?? ''
  const senderLower = msg.sender?.toLowerCase() ?? ''

  if (guestPhone && (recipNorm.endsWith(guestPhone) || senderNorm.endsWith(guestPhone))) return 'guest'
  if (clientEmail && (recipLower.includes(clientEmail) || senderLower.includes(clientEmail))) return 'booker'
  if (clientPhone && (recipNorm.endsWith(clientPhone) || senderNorm.endsWith(clientPhone))) return 'booker'

  return 'booker' // default outbound to booker
}

interface BookingMessageChatProps {
  messages: MessageLog[]
  booking: Booking
}

export function BookingMessageChat({ messages, booking }: BookingMessageChatProps) {
  const [tab, setTab] = useState<ContactTab>('all')

  const hasGuest  = !!booking.guest_phone
  const hasDriver = !!booking.driver_id

  const tabs: { key: ContactTab; label: string; icon: React.ElementType }[] = [
    { key: 'all',    label: 'All',                                                   icon: Users },
    { key: 'booker', label: booking.client?.name?.split(' ')[0] ?? 'Booker',        icon: User  },
    ...(hasGuest  ? [{ key: 'guest'  as ContactTab, label: booking.guest_name?.split(' ')[0] ?? 'Guest',  icon: User }] : []),
    ...(hasDriver ? [{ key: 'driver' as ContactTab, label: booking.driver?.name?.split(' ')[0] ?? 'Driver', icon: Car }] : []),
  ]

  const visible = tab === 'all'
    ? messages
    : messages.filter(m => assignTab(m, booking) === tab)

  if (messages.length === 0) {
    return <p className="text-sm text-[#737686]">No messages logged for this booking.</p>
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {tabs.map(t => {
          const Icon = t.icon
          const count = t.key === 'all'
            ? messages.length
            : messages.filter(m => assignTab(m, booking) === t.key).length
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-[#1A56DB] text-white'
                  : 'bg-[#F3F3FE] text-[#434654] hover:bg-[#EDEDF8]'
              }`}
            >
              <Icon className="w-3 h-3" />
              {t.label}
              <span className={`text-[10px] font-normal ${tab === t.key ? 'text-white/70' : 'text-[#9CA3AF]'}`}>
                ({count})
              </span>
            </button>
          )
        })}
      </div>

      {/* Chat bubbles */}
      <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <p className="text-sm text-[#737686]">No messages for this contact.</p>
        ) : (
          visible.map(msg => {
            const isOut   = msg.direction === 'outbound'
            const isEmail = msg.channel === 'email'
            const label   = msg.template_used ? (TEMPLATE_LABELS[msg.template_used] ?? msg.template_used) : null
            const failed  = msg.status?.startsWith('failed')

            return (
              <div key={msg.id} className={`flex gap-2 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Channel avatar */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                  isOut ? 'bg-[#D4DCFF]' : 'bg-[#D1FAE5]'
                }`}>
                  {isEmail
                    ? <Mail className={`w-3.5 h-3.5 ${isOut ? 'text-[#1A56DB]' : 'text-emerald-700'}`} />
                    : <MessageCircle className={`w-3.5 h-3.5 ${isOut ? 'text-[#1A56DB]' : 'text-emerald-700'}`} />
                  }
                </div>

                <div className={`max-w-[78%] flex flex-col gap-1 ${isOut ? 'items-end' : 'items-start'}`}>
                  {/* Meta */}
                  <div className={`flex items-center gap-1.5 text-[10px] text-[#9CA3AF] flex-wrap ${isOut ? 'flex-row-reverse' : ''}`}>
                    {label && (
                      <span className="px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">{label}</span>
                    )}
                    {isOut && msg.recipient && <span>To: {msg.recipient}</span>}
                    {!isOut && msg.sender  && <span>From: {msg.sender}</span>}
                    <span>{formatTimestamp(msg.sent_at)}</span>
                    {failed
                      ? <span className="text-red-500 inline-flex items-center gap-0.5"><XCircle className="w-3 h-3" /> Failed</span>
                      : isOut && <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                    }
                  </div>

                  {/* Bubble */}
                  <div className={`px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    isOut
                      ? `bg-[#1A56DB] text-white rounded-2xl rounded-tr-sm ${failed ? 'opacity-60' : ''}`
                      : 'bg-[#F3F4F6] text-[#191B23] rounded-2xl rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
