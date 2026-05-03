'use client'
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mail, MessageCircle, ArrowUpRight, ArrowDownLeft, CheckCircle, XCircle, Clock, RefreshCw, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import Link from 'next/link'

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
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

export default function MessagesPage() {
  const [dirFilter, setDirFilter] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [search, setSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search by 400ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const hasFilters = !!dateFrom || !!dateTo || !!debouncedSearch

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setDebouncedSearch('')
  }

  const apiParams = new URLSearchParams()
  if (dateFrom)        apiParams.set('from', dateFrom)
  if (dateTo)          apiParams.set('to', dateTo)
  if (debouncedSearch) apiParams.set('q', debouncedSearch)

  const { data: rows = [], isLoading, refetch } = useQuery<MessageRow[]>({
    queryKey: ['messages', dateFrom, dateTo, debouncedSearch],
    queryFn: () => fetch(`/api/messages?${apiParams}`).then(r => r.json()),
  })

  const visible = dirFilter === 'all' ? rows : rows.filter(r => r.type === dirFilter)

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-[#191B23]">Message Log</h1>
          <p className="text-sm text-[#737686] mt-0.5">
            {isLoading ? 'Loading…' : `${visible.length} message${visible.length !== 1 ? 's' : ''}${hasFilters ? ' matching filters' : ''}`}
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
        {/* Direction tabs */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-[#C3C5D7] overflow-hidden text-sm">
            {(['all', 'inbound', 'outbound'] as const).map(f => (
              <button
                key={f}
                onClick={() => setDirFilter(f)}
                className={cn(
                  'px-3 py-1.5 capitalize transition-colors',
                  dirFilter === f ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                )}
              >
                {f}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-[#737686] hover:text-red-600 px-2 py-1 rounded border border-[#C3C5D7] hover:border-red-300 transition-colors"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>

        {/* Date + Search row */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[280px]">
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[#737686] mb-1 block">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 text-sm border-[#C3C5D7]"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[#737686] mb-1 block">To</label>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 text-sm border-[#C3C5D7]"
              />
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-[#737686] mb-1 block">Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737686]" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Phone number or name…"
                className="h-8 pl-8 text-sm border-[#C3C5D7]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#737686] hover:text-[#191B23]">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Message list */}
      <div className="bg-white rounded-xl border border-[#C3C5D7] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-[#737686]">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-sm text-[#737686]">
            <span>No messages found.</span>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[#1A56DB] text-xs hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#EDEDF8]">
            {visible.map(msg => {
              const isOutbound = msg.type === 'outbound'
              const isEmail    = msg.channel === 'email'
              const label      = msg.template ? (TEMPLATE_LABELS[msg.template] ?? msg.template) : null
              const displayName = msg.client_name || msg.contact

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

                    {displayName && (
                      <p className="text-xs text-[#737686] mb-1 flex items-center gap-1.5">
                        <span>{isOutbound ? 'To:' : 'From:'}</span>
                        {msg.client_name && (
                          <span className="font-medium text-[#434654]">{msg.client_name}</span>
                        )}
                        {msg.contact && msg.contact !== msg.client_name && (
                          <span className="text-[#9CA3AF]">{msg.contact}</span>
                        )}
                      </p>
                    )}

                    <p className="text-sm text-[#434654] leading-relaxed line-clamp-2 break-words">
                      {msg.content}
                    </p>
                    {msg.booking_id && (
                      <Link
                        href={`/bookings/${msg.booking_id}`}
                        className="text-xs text-[#1A56DB] hover:underline mt-1 inline-block"
                      >
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
