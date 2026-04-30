'use client'
import { useEffect, useState } from 'react'
import { Mail, MessageCircle, ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface MessageRow {
  id: string
  type: 'inbound' | 'outbound'
  channel: string
  contact: string | null
  content: string
  template: string | null
  status: string | null
  booking_id: string | null
  timestamp: string
}

const TEMPLATE_LABELS: Record<string, string> = {
  booking_received: 'Booking Received',
  missing_info_request: 'Missing Info',
  approval_request: 'Approval Request',
  approval_chase: 'Approval Chase',
  booking_confirmed: 'Confirmed',
  driver_details_to_client: 'Driver Details',
  trip_brief_to_driver: 'Trip Brief',
  cancellation_client: 'Cancellation',
}

function StatusBadge({ status, type }: { status: string | null; type: 'inbound' | 'outbound' }) {
  if (type === 'inbound') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#D1FAE5] text-green-700">
        <ArrowDownLeft className="w-3 h-3" /> Received
      </span>
    )
  }
  const s = status || ''
  if (s === 'sent') return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#D1FAE5] text-green-700">
      <CheckCircle className="w-3 h-3" /> Sent
    </span>
  )
  if (s.startsWith('failed')) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600" title={s}>
      <XCircle className="w-3 h-3" /> Failed
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">
      <Clock className="w-3 h-3" /> {s || 'pending'}
    </span>
  )
}

function formatTs(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function MessagesPage() {
  const [rows, setRows] = useState<MessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound'>('all')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/messages')
      const data = await res.json()
      setRows(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const visible = filter === 'all' ? rows : rows.filter(r => r.type === filter)

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#191B23]">Message Log</h1>
          <p className="text-sm text-[#737686] mt-0.5">All inbound and outbound messages</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[#C3C5D7] overflow-hidden text-sm">
            {(['all', 'inbound', 'outbound'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 capitalize transition-colors',
                  filter === f ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="p-2 rounded-lg border border-[#C3C5D7] bg-white hover:bg-[#F3F3FE] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-[#434654]" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#C3C5D7] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#737686]">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#737686]">No messages found.</div>
        ) : (
          <div className="divide-y divide-[#EDEDF8]">
            {visible.map(msg => {
              const isOutbound = msg.type === 'outbound'
              const isEmail = msg.channel === 'email'
              const label = msg.template ? (TEMPLATE_LABELS[msg.template] ?? msg.template) : null

              return (
                <div key={msg.id} className="flex gap-3 px-4 py-3 hover:bg-[#FAF8FF] transition-colors">
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    isOutbound ? 'bg-[#D4DCFF]' : 'bg-[#D1FAE5]'
                  )}>
                    {isEmail
                      ? <Mail className={cn('w-4 h-4', isOutbound ? 'text-[#1A56DB]' : 'text-green-700')} />
                      : <MessageCircle className={cn('w-4 h-4', isOutbound ? 'text-[#1A56DB]' : 'text-green-700')} />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {isOutbound
                        ? <ArrowUpRight className="w-3.5 h-3.5 text-[#1A56DB] shrink-0" />
                        : <ArrowDownLeft className="w-3.5 h-3.5 text-green-600 shrink-0" />
                      }
                      <span className="text-sm font-medium text-[#191B23] capitalize">
                        {msg.channel} — {isOutbound ? 'Outbound' : 'Inbound'}
                      </span>
                      {label && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">{label}</span>
                      )}
                      <StatusBadge status={msg.status} type={msg.type} />
                      <span className="text-xs text-[#737686] ml-auto shrink-0">{formatTs(msg.timestamp)}</span>
                    </div>
                    {msg.contact && (
                      <p className="text-xs text-[#737686] mb-1">
                        {isOutbound ? `To: ${msg.contact}` : `From: ${msg.contact}`}
                      </p>
                    )}
                    <p className="text-sm text-[#434654] leading-relaxed line-clamp-2 break-words">
                      {msg.content}
                    </p>
                    {msg.booking_id && (
                      <Link href={`/bookings/${msg.booking_id}`} className="text-xs text-[#1A56DB] hover:underline mt-1 inline-block">
                        View booking →
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
