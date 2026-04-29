'use client'
import { Mail, MessageCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { formatTimestamp } from '@/lib/utils/date'
import type { MessageLog } from '@/types'

interface MessageTimelineProps {
  messages: MessageLog[]
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_received: 'Booking Received',
  missing_info_request: 'Missing Info Request',
  approval_request: 'Approval Request',
  approval_chase: 'Approval Chase',
  verbal_approval_ack: 'Verbal Approval Ack',
  booking_confirmed: 'Booking Confirmed',
  driver_details_to_client: 'Driver Details',
  trip_brief_to_driver: 'Trip Brief',
  cancellation_client: 'Cancellation (Client)',
  cancellation_driver: 'Cancellation (Driver)',
  substitute_vehicle_client: 'Substitute Vehicle',
}

export function MessageTimeline({ messages }: MessageTimelineProps) {
  if (messages.length === 0) {
    return <p className="text-sm text-[#737686]">No messages logged for this booking.</p>
  }

  return (
    <div className="space-y-3">
      {messages.map(msg => {
        const isOutbound = msg.direction === 'outbound'
        const isEmail = msg.channel === 'email'
        const label = msg.template_used ? (TEMPLATE_LABELS[msg.template_used] ?? msg.template_used) : null

        return (
          <div key={msg.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isOutbound ? 'bg-[#D4DCFF]' : 'bg-[#D1FAE5]'}`}>
                {isEmail
                  ? <Mail className={`w-3.5 h-3.5 ${isOutbound ? 'text-[#1A56DB]' : 'text-green-700'}`} />
                  : <MessageCircle className={`w-3.5 h-3.5 ${isOutbound ? 'text-[#1A56DB]' : 'text-green-700'}`} />
                }
              </div>
              <div className="w-px flex-1 bg-[#EDEDF8] mt-1" />
            </div>

            <div className="pb-3 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                {isOutbound
                  ? <ArrowUpRight className="w-3 h-3 text-[#1A56DB] shrink-0" />
                  : <ArrowDownLeft className="w-3 h-3 text-green-600 shrink-0" />
                }
                <span className="text-xs font-medium text-[#191B23] capitalize">
                  {msg.channel} — {isOutbound ? 'Outbound' : 'Inbound'}
                </span>
                {label && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">{label}</span>
                )}
                <span className="text-xs text-[#737686] ml-auto shrink-0">{formatTimestamp(msg.sent_at)}</span>
              </div>
              {(msg.recipient || msg.sender) && (
                <p className="text-xs text-[#737686] mb-1">
                  {isOutbound ? `To: ${msg.recipient}` : `From: ${msg.sender}`}
                </p>
              )}
              <p className="text-xs text-[#434654] leading-relaxed line-clamp-3 whitespace-pre-wrap break-words">
                {msg.content}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
