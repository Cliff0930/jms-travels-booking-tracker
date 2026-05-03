'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Mail, MessageCircle, ArrowUpRight, ArrowDownLeft,
  CheckCircle, XCircle, Clock, RefreshCw, X, User,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { format } from 'date-fns'
import type { Client } from '@/types'

interface MessageRow {
  id: string
  type: 'inbound' | 'outbound'
  channel: string
  contact: string | null
  client_name: string | null
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

function formatTs(ts: string) {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function StatusBadge({ status, type }: { status: string | null; type: 'inbound' | 'outbound' }) {
  if (type === 'inbound') return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#D1FAE5] text-green-700">
      <ArrowDownLeft className="w-3 h-3" /> Received
    </span>
  )
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

// ── Client picker dropdown ───────────────────────────────────────────────────
function ClientPicker({ value, onChange }: { value: Client | null; onChange: (c: Client | null) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients'],
    queryFn: () => fetch('/api/clients').then(r => r.json()),
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = clients.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.primary_phone?.includes(search) ||
    c.primary_email?.toLowerCase().includes(search.toLowerCase())
  )

  if (value) {
    const initials = value.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded border border-[#1A56DB] bg-[#F0F4FF]">
        <div className="w-6 h-6 rounded-full bg-[#1A56DB] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[#191B23] truncate block">{value.name}</span>
          {value.primary_phone && <span className="text-xs text-[#737686]">{value.primary_phone}</span>}
        </div>
        <button
          onClick={() => { onChange(null); setSearch('') }}
          className="text-[#737686] hover:text-[#191B23] shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded border border-[#C3C5D7] bg-white cursor-text"
        onClick={() => setOpen(true)}
      >
        <User className="w-3.5 h-3.5 text-[#737686] shrink-0" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          placeholder="Select client to view conversation…"
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-[#737686]"
          onClick={e => { e.stopPropagation(); setOpen(true) }}
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[#737686] hover:text-[#191B23]">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#C3C5D7] rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-[#737686]">
              {clients.length === 0 ? 'No clients found.' : 'No matching clients.'}
            </p>
          ) : (
            filtered.map(client => (
              <button
                key={client.id}
                onClick={() => { onChange(client); setOpen(false); setSearch('') }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#F3F3FE] text-left transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0">
                  {client.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[#191B23] truncate">{client.name}</div>
                  <div className="text-xs text-[#737686]">
                    {client.primary_phone || client.primary_email || 'No contact'}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Chat bubble view ─────────────────────────────────────────────────────────
function ChatView({ messages, client }: { messages: MessageRow[]; client: Client }) {
  // Group by calendar date
  const groups: { dateLabel: string; msgs: MessageRow[] }[] = []
  for (const msg of messages) {
    const dateLabel = format(new Date(msg.timestamp), 'd MMMM yyyy')
    const last = groups[groups.length - 1]
    if (!last || last.dateLabel !== dateLabel) {
      groups.push({ dateLabel, msgs: [msg] })
    } else {
      last.msgs.push(msg)
    }
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#737686]">
        <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No messages found for {client.name}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 px-4 py-4">
      {groups.map(group => (
        <div key={group.dateLabel}>
          {/* Date separator */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#EDEDF8]" />
            <span className="text-xs font-medium text-[#737686] px-2">{group.dateLabel}</span>
            <div className="flex-1 h-px bg-[#EDEDF8]" />
          </div>

          <div className="space-y-2">
            {group.msgs.map(msg => {
              const isOutbound = msg.type === 'outbound'
              const label = msg.template ? (TEMPLATE_LABELS[msg.template] ?? msg.template) : null

              return (
                <div key={msg.id} className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[75%] space-y-1', isOutbound ? 'items-end' : 'items-start')}>
                    {label && (
                      <div className={cn('text-[10px] font-medium px-1', isOutbound ? 'text-right text-[#737686]' : 'text-[#737686]')}>
                        {label}
                      </div>
                    )}
                    <div className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                      isOutbound
                        ? 'bg-[#1A56DB] text-white rounded-tr-sm'
                        : 'bg-[#F3F3FE] text-[#191B23] rounded-tl-sm border border-[#E5E5F0]'
                    )}>
                      {msg.content}
                    </div>
                    <div className={cn('flex items-center gap-2 px-1', isOutbound ? 'justify-end' : 'justify-start')}>
                      <span className="text-[10px] text-[#737686]">{formatTime(msg.timestamp)}</span>
                      {isOutbound && <StatusBadge status={msg.status} type={msg.type} />}
                      {msg.booking_id && (
                        <Link href={`/bookings/${msg.booking_id}`} className="text-[10px] text-[#1A56DB] hover:underline">
                          Booking →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [dirFilter, setDirFilter]           = useState<'all' | 'inbound' | 'outbound'>('all')
  const [dateFrom, setDateFrom]             = useState('')
  const [dateTo, setDateTo]                 = useState('')

  const apiParams = new URLSearchParams()
  if (selectedClient) apiParams.set('client_id', selectedClient.id)
  if (dateFrom)        apiParams.set('from', dateFrom)
  if (dateTo)          apiParams.set('to', dateTo)

  const { data: rows = [], isLoading, refetch } = useQuery<MessageRow[]>({
    queryKey: ['messages', selectedClient?.id ?? null, dateFrom, dateTo],
    queryFn: () => fetch(`/api/messages?${apiParams}`).then(r => r.json()),
  })

  const visible = selectedClient
    ? rows
    : dirFilter === 'all' ? rows : rows.filter(r => r.type === dirFilter)

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#191B23]">Message Log</h1>
          <p className="text-sm text-[#737686] mt-0.5">
            {isLoading
              ? 'Loading…'
              : selectedClient
                ? `${visible.length} message${visible.length !== 1 ? 's' : ''} with ${selectedClient.name}`
                : `${visible.length} message${visible.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg border border-[#C3C5D7] bg-white hover:bg-[#F3F3FE] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-[#434654]" />
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#C3C5D7] p-3 space-y-3">
        {/* Client picker */}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[#737686] mb-1 block">Client</label>
          <ClientPicker value={selectedClient} onChange={c => { setSelectedClient(c); setDirFilter('all') }} />
        </div>

        {/* Date range + direction tabs */}
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex items-end gap-2 flex-1 min-w-[260px]">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[#737686] mb-1 block">From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-sm border-[#C3C5D7]" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[#737686] mb-1 block">To</label>
              <Input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)} className="h-8 text-sm border-[#C3C5D7]" />
            </div>
          </div>

          {!selectedClient && (
            <div className="flex rounded-lg border border-[#C3C5D7] overflow-hidden text-sm self-end">
              {(['all', 'inbound', 'outbound'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setDirFilter(f)}
                  className={cn(
                    'px-3 py-1.5 capitalize transition-colors h-8',
                    dirFilter === f ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="flex items-center gap-1 text-xs text-[#737686] hover:text-red-600 px-2 h-8 rounded border border-[#C3C5D7] hover:border-red-300 transition-colors self-end"
            >
              <X className="w-3 h-3" /> Clear dates
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-[#C3C5D7] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#737686]">Loading…</div>
        ) : selectedClient ? (
          <ChatView messages={visible} client={selectedClient} />
        ) : visible.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#737686]">No messages found.</div>
        ) : (
          <div className="divide-y divide-[#EDEDF8]">
            {visible.map(msg => {
              const isOutbound = msg.type === 'outbound'
              const isEmail    = msg.channel === 'email'
              const label      = msg.template ? (TEMPLATE_LABELS[msg.template] ?? msg.template) : null

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
                      {label && <span className="text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">{label}</span>}
                      <StatusBadge status={msg.status} type={msg.type} />
                      <span className="text-xs text-[#737686] ml-auto shrink-0">{formatTs(msg.timestamp)}</span>
                    </div>
                    {(msg.client_name || msg.contact) && (
                      <p className="text-xs text-[#737686] mb-1 flex items-center gap-1.5">
                        <span>{isOutbound ? 'To:' : 'From:'}</span>
                        {msg.client_name && <span className="font-medium text-[#434654]">{msg.client_name}</span>}
                        {msg.contact && msg.contact !== msg.client_name && (
                          <span className="text-[#9CA3AF]">{msg.contact}</span>
                        )}
                      </p>
                    )}
                    <p className="text-sm text-[#434654] leading-relaxed line-clamp-2 break-words">{msg.content}</p>
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
