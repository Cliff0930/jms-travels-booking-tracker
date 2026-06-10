'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Mail, MessageCircle, ArrowDownLeft, ChevronLeft,
  CheckCircle, XCircle, Clock, RefreshCw, X, Car, Search, Phone,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { format } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Contact {
  id: string
  phone?: string
  driver_id?: string
  name: string | null
  client_id: string | null
  vehicle_name?: string | null
  last_message: string
  last_time: string
  needs_attention: boolean
}

type ChannelTab = 'whatsapp' | 'email' | 'driver'

// ── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_LABELS: Record<string, string> = {
  booking_received: 'Booking Received',
  missing_info_request: 'Missing Info',
  approval_request: 'Approval Request',
  approval_chase: 'Approval Chase',
  verbal_approval_ack: 'Verbal Approval',
  booking_confirmed: 'Confirmed',
  driver_details_to_client: 'Driver Details',
  trip_brief_to_driver: 'Trip Brief',
  leg_driver_brief: 'Leg Brief',
  day_links: 'Day Links',
  jms_leg_day_links: 'Day Links',
  cancellation_client: 'Cancellation',
  cancellation_driver: 'Cancellation (Driver)',
  substitute_vehicle_client: 'Driver Change',
}

function initials(name: string | null | undefined, fallback = '?') {
  if (!name) return fallback
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

function relativeTime(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return format(new Date(ts), 'd MMM')
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

// ── StatusBadge ──────────────────────────────────────────────────────────────

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
  if (s === 'skipped') return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
      <Clock className="w-3 h-3" /> Skipped
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-[#EDEDF8] text-[#434654]">
      <Clock className="w-3 h-3" /> {s || 'pending'}
    </span>
  )
}

// ── ChatView ─────────────────────────────────────────────────────────────────

function ChatView({ messages, name, bubbleColor }: { messages: MessageRow[]; name: string; bubbleColor: string }) {
  const groups: { dateLabel: string; msgs: MessageRow[] }[] = []
  for (const msg of messages) {
    const dateLabel = format(new Date(msg.timestamp), 'd MMMM yyyy')
    const last = groups[groups.length - 1]
    if (!last || last.dateLabel !== dateLabel) groups.push({ dateLabel, msgs: [msg] })
    else last.msgs.push(msg)
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#737686]">
        <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No messages with {name} yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1 px-4 py-4">
      {groups.map(group => (
        <div key={group.dateLabel}>
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[#EDEDF8]" />
            <span className="text-xs font-medium text-[#737686] px-2">{group.dateLabel}</span>
            <div className="flex-1 h-px bg-[#EDEDF8]" />
          </div>
          <div className="space-y-2">
            {group.msgs.map(msg => {
              const isOut = msg.type === 'outbound'
              const label = msg.template ? (TEMPLATE_LABELS[msg.template] ?? msg.template) : null
              return (
                <div key={msg.id} className={cn('flex', isOut ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[75%] space-y-1', isOut ? 'items-end' : 'items-start')}>
                    {label && (
                      <div className={cn('text-[10px] font-medium px-1', isOut ? 'text-right text-[#737686]' : 'text-[#737686]')}>
                        {label}
                      </div>
                    )}
                    <div className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                      isOut
                        ? `${bubbleColor} text-white rounded-tr-sm`
                        : 'bg-[#F3F3FE] text-[#191B23] rounded-tl-sm border border-[#E5E5F0]'
                    )}>
                      {msg.content}
                    </div>
                    <div className={cn('flex items-center gap-2 px-1 flex-wrap', isOut ? 'justify-end' : 'justify-start')}>
                      <span className="text-[10px] text-[#737686]">{formatTime(msg.timestamp)}</span>
                      {isOut && <StatusBadge status={msg.status} type={msg.type} />}
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

// ── ContactCard ───────────────────────────────────────────────────────────────

function ContactCard({ contact, tab, selected, onClick }: {
  contact: Contact; tab: ChannelTab; selected: boolean; onClick: () => void
}) {
  const displayName = contact.name || contact.phone || 'Unknown'
  const sub = tab === 'driver' ? contact.vehicle_name : contact.phone
  const avatarBg = contact.needs_attention
    ? 'bg-red-400'
    : tab === 'driver' ? 'bg-[#7E3AF2]' : tab === 'email' ? 'bg-[#0F766E]' : 'bg-[#25D366]'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 border-b border-[#EDEDF8] transition-colors text-left',
        selected
          ? 'bg-[#EEF2FF] border-l-[3px] border-l-[#1A56DB]'
          : 'hover:bg-[#F9F9FE] border-l-[3px] border-l-transparent'
      )}
    >
      <div className="relative shrink-0">
        <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white', avatarBg)}>
          {initials(contact.name, contact.phone?.slice(-2) ?? '?')}
        </div>
        {contact.needs_attention && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-sm font-semibold text-[#191B23] truncate">{displayName}</span>
          <span className="text-[10px] text-[#737686] shrink-0 ml-1">{relativeTime(contact.last_time)}</span>
        </div>
        {sub && sub !== displayName && (
          <p className="text-[10px] text-[#9CA3AF] truncate mb-0.5">{sub}</p>
        )}
        <p className="text-xs text-[#737686] truncate">{contact.last_message}</p>
      </div>
    </button>
  )
}

// ── ThreadHeader ──────────────────────────────────────────────────────────────

function ThreadHeader({ contact, tab, onBack }: { contact: Contact; tab: ChannelTab; onBack: () => void }) {
  const name = contact.name || contact.phone || 'Unknown'
  return (
    <div className="flex items-center gap-2 px-3 py-3 border-b border-[#EDEDF8] bg-white shrink-0">
      <button
        onClick={onBack}
        className="md:hidden p-1.5 rounded-lg hover:bg-[#F3F3FE] text-[#434654] shrink-0 -ml-1"
        aria-label="Back to contacts"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div className={cn(
        'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0',
        tab === 'driver' ? 'bg-[#7E3AF2]' : tab === 'email' ? 'bg-[#0F766E]' : 'bg-[#25D366]'
      )}>
        {initials(contact.name, contact.phone?.slice(-2) ?? '?')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#191B23] truncate">{name}</p>
        {contact.phone && (
          <div className="flex items-center gap-1 text-xs text-[#737686]">
            <Phone className="w-3 h-3" />
            <span>{contact.phone}</span>
          </div>
        )}
        {contact.vehicle_name && (
          <p className="text-xs text-[#737686]">{contact.vehicle_name}</p>
        )}
      </div>
      {contact.client_id && (
        <Link
          href={`/clients?id=${contact.client_id}`}
          className="text-xs text-[#1A56DB] hover:underline shrink-0"
        >
          View client →
        </Link>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MessagesPage() {
  const qc = useQueryClient()
  const threadRef = useRef<HTMLDivElement>(null)

  const [tab, setTab] = useState<ChannelTab>('whatsapp')
  const [selected, setSelected] = useState<Contact | null>(null)
  const [search, setSearch] = useState('')

  // Contacts list — auto-refresh every 30s
  const { data: contacts = [], isLoading: contactsLoading, refetch: refetchContacts } = useQuery<Contact[]>({
    queryKey: ['message-contacts', tab],
    queryFn: () => fetch(`/api/messages/contacts?tab=${tab}`).then(r => r.json()),
    refetchInterval: 30000,
  })

  // Build thread fetch params
  const threadParam = selected
    ? selected.driver_id
      ? `driver_id=${selected.driver_id}`
      : selected.client_id
        ? `client_id=${selected.client_id}`
        : `phone=${encodeURIComponent(selected.phone || '')}`
    : null

  // Thread — auto-refresh every 15s when a contact is open
  const { data: thread = [], isLoading: threadLoading } = useQuery<MessageRow[]>({
    queryKey: ['message-thread', selected?.id],
    queryFn: () => fetch(`/api/messages?${threadParam}`).then(r => r.json()),
    enabled: !!threadParam,
    refetchInterval: 15000,
  })

  // Scroll thread to bottom when messages load/change
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [thread])

  // Reset selection when tab changes
  useEffect(() => {
    setSelected(null)
    setSearch('')
  }, [tab])

  const filtered = search
    ? contacts.filter(c => {
        const q = search.toLowerCase()
        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.last_message?.toLowerCase().includes(q)
        )
      })
    : contacts

  const needsAttentionCount = contacts.filter(c => c.needs_attention).length

  const bubbleColor = tab === 'driver' ? 'bg-[#7E3AF2]' : tab === 'email' ? 'bg-[#0F766E]' : 'bg-[#25D366]'

  const tabConfig: { key: ChannelTab; label: string; icon: React.ReactNode; activeClass: string }[] = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: <MessageCircle className="w-4 h-4" />,
      activeClass: 'bg-[#25D366] text-white border-[#25D366]',
    },
    {
      key: 'email',
      label: 'Email',
      icon: <Mail className="w-4 h-4" />,
      activeClass: 'bg-[#0F766E] text-white border-[#0F766E]',
    },
    {
      key: 'driver',
      label: 'Drivers',
      icon: <Car className="w-4 h-4" />,
      activeClass: 'bg-[#7E3AF2] text-white border-[#7E3AF2]',
    },
  ]

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-17rem)] md:h-[calc(100dvh-8rem)]">
      <PageHeader
        title="Messages"
        description={
          contactsLoading
            ? 'Loading…'
            : `${contacts.length} conversation${contacts.length !== 1 ? 's' : ''}${needsAttentionCount > 0 ? ` · ${needsAttentionCount} need${needsAttentionCount === 1 ? 's' : ''} attention` : ''}`
        }
        actions={
          <button
            onClick={() => { refetchContacts(); qc.invalidateQueries({ queryKey: ['message-thread'] }) }}
            className="p-2 rounded-lg border border-[#C3C5D7] bg-white hover:bg-[#F3F3FE] transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-[#434654]" />
          </button>
        }
      />

      {/* Channel tabs */}
      <div className="flex gap-2 shrink-0">
        {tabConfig.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 h-9 rounded-lg border text-sm font-medium transition-colors',
              tab === t.key ? t.activeClass : 'bg-white border-[#C3C5D7] text-[#434654] hover:bg-[#F3F3FE]'
            )}
          >
            {t.icon}
            {t.label}
            {t.key === 'whatsapp' && needsAttentionCount > 0 && tab !== 'whatsapp' && (
              <span className="ml-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
                {needsAttentionCount > 9 ? '9+' : needsAttentionCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-1 min-h-0 border border-[#C3C5D7] rounded-xl overflow-hidden bg-white">

        {/* Left: contact list — full width on mobile, hidden when thread open */}
        <div className={cn(
          'w-full md:w-[300px] md:shrink-0 flex-col border-r border-[#EDEDF8]',
          selected ? 'hidden md:flex' : 'flex'
        )}>
          {/* Search */}
          <div className="p-2.5 border-b border-[#EDEDF8] shrink-0">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 w-3.5 h-3.5 text-[#9CA3AF]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full h-8 pl-8 pr-7 text-sm border border-[#C3C5D7] rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#1A56DB] placeholder:text-[#9CA3AF]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 text-[#9CA3AF] hover:text-[#434654]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {contactsLoading ? (
              <div className="flex justify-center py-12 text-sm text-[#737686]">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#737686] gap-2">
                <MessageCircle className="w-7 h-7 opacity-25" />
                <p className="text-sm">{search ? 'No matches' : 'No conversations yet'}</p>
              </div>
            ) : (
              filtered.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  tab={tab}
                  selected={selected?.id === c.id}
                  onClick={() => setSelected(c)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: thread — full width on mobile, shown only when contact selected */}
        <div className={cn(
          'flex-col min-w-0 flex-1',
          selected ? 'flex' : 'hidden md:flex'
        )}>
          {selected ? (
            <>
              <ThreadHeader contact={selected} tab={tab} onBack={() => setSelected(null)} />
              <div ref={threadRef} className="flex-1 overflow-y-auto">
                {threadLoading ? (
                  <div className="flex justify-center py-12 text-sm text-[#737686]">Loading…</div>
                ) : (
                  <ChatView
                    messages={thread}
                    name={selected.name || selected.phone || 'Unknown'}
                    bubbleColor={bubbleColor}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-[#737686] gap-3">
              {tab === 'whatsapp' && <MessageCircle className="w-10 h-10 opacity-20" />}
              {tab === 'email' && <Mail className="w-10 h-10 opacity-20" />}
              {tab === 'driver' && <Car className="w-10 h-10 opacity-20" />}
              <p className="text-sm">Select a conversation to view messages</p>
              {needsAttentionCount > 0 && tab === 'whatsapp' && (
                <p className="text-xs text-red-500 font-medium">
                  {needsAttentionCount} conversation{needsAttentionCount !== 1 ? 's' : ''} need attention
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
