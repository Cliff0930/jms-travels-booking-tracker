'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Plus, X, ExternalLink, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Link from 'next/link'
import { formatDate } from '@/lib/utils/date'
import type { TripGroup, TripGroupBooking } from '@/types'

const TRIP_TYPE_LABEL: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
const TRIP_TYPE_COLOR: Record<string, string> = {
  local: 'bg-[#ECFDF5] text-[#065F46]',
  outstation: 'bg-blue-50 text-blue-700',
  airport: 'bg-amber-50 text-amber-700',
}
const STATUS_COLOR: Record<string, string> = {
  confirmed: 'bg-[#EDEDF8] text-[#434654]',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  draft: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-red-50 text-red-600',
}

interface TripGroupPanelProps {
  bookingId: string
  bookingRef: string
  tripGroupId: string | null
}

export function TripGroupPanel({ bookingId, bookingRef, tripGroupId }: TripGroupPanelProps) {
  const qc = useQueryClient()
  const [showDialog, setShowDialog] = useState(false)
  const [mode, setMode] = useState<'create' | 'link'>('create')
  const [newLabel, setNewLabel] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [saving, setSaving] = useState(false)
  const [unlinking, setUnlinking] = useState(false)

  const { data: group, isLoading } = useQuery<TripGroup>({
    queryKey: ['trip-group', tripGroupId],
    queryFn: () => fetch(`/api/trip-groups/${tripGroupId}`).then(r => r.json()),
    enabled: !!tripGroupId,
  })

  const { data: searchResults = [] } = useQuery<{ id: string; label: string }[]>({
    queryKey: ['trip-groups-search', searchQ],
    queryFn: () => fetch(`/api/trip-groups?q=${encodeURIComponent(searchQ)}`).then(r => r.json()),
    enabled: mode === 'link',
  })

  async function linkToGroup(groupId: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/trip-group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      qc.invalidateQueries({ queryKey: ['bookings', bookingId] })
      qc.invalidateQueries({ queryKey: ['trip-group', groupId] })
      toast.success('Linked to trip group')
      setShowDialog(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateAndLink() {
    if (!newLabel.trim()) return
    setSaving(true)
    try {
      const createRes = await fetch('/api/trip-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      if (!createRes.ok) throw new Error((await createRes.json()).error)
      const group = await createRes.json()
      await linkToGroup(group.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create group')
      setSaving(false)
    }
  }

  async function handleUnlink() {
    setUnlinking(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/trip-group`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      qc.invalidateQueries({ queryKey: ['bookings', bookingId] })
      if (tripGroupId) qc.invalidateQueries({ queryKey: ['trip-group', tripGroupId] })
      toast.success('Unlinked from group')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unlink')
    } finally {
      setUnlinking(false)
    }
  }

  if (isLoading && tripGroupId) {
    return <p className="text-sm text-[#737686]">Loading group…</p>
  }

  // Booking is in a group — show siblings
  if (tripGroupId && group) {
    const siblings = (group.bookings ?? []).filter(b => b.id !== bookingId)
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-[#1A56DB]" />
            <span className="text-sm font-medium text-[#191B23]">{group.label}</span>
            <span className="text-xs text-[#737686]">({(group.bookings?.length ?? 0)} booking{(group.bookings?.length ?? 0) !== 1 ? 's' : ''})</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs px-2 rounded-sm text-red-600 border-red-200 hover:bg-red-50"
            onClick={handleUnlink}
            disabled={unlinking}
          >
            {unlinking ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Unlink
          </Button>
        </div>

        {siblings.length === 0 ? (
          <p className="text-xs text-[#737686]">No other bookings in this group yet. Link another booking from its detail page.</p>
        ) : (
          <div className="space-y-2">
            {siblings.map((b: TripGroupBooking) => {
              const driver = b.driver
              return (
                <div key={b.id} className="flex items-center justify-between p-2.5 rounded-lg border border-[#C3C5D7] bg-[#F9F9FE]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-[#1A56DB]">{b.booking_ref}</span>
                      {b.pickup_date && <span className="text-xs text-[#737686]">{formatDate(b.pickup_date)}</span>}
                      <Badge className={`text-xs px-1.5 py-0 ${TRIP_TYPE_COLOR[b.trip_type] ?? 'bg-[#EDEDF8] text-[#434654]'}`}>
                        {TRIP_TYPE_LABEL[b.trip_type] ?? b.trip_type}
                      </Badge>
                      <Badge className={`text-xs px-1.5 py-0 capitalize ${STATUS_COLOR[b.status] ?? 'bg-[#EDEDF8] text-[#434654]'}`}>
                        {b.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {b.pickup_location && (
                      <p className="text-xs text-[#737686] mt-0.5 truncate">
                        {b.pickup_location}{b.drop_location ? ` → ${b.drop_location}` : ''}
                      </p>
                    )}
                    {driver?.name && (
                      <p className="text-xs text-[#434654] mt-0.5">{driver.name} · {driver.vehicle_name} · {driver.vehicle_number}</p>
                    )}
                    {b.guest_name && <p className="text-xs text-[#737686]">Guest: {b.guest_name}</p>}
                  </div>
                  <Link href={`/bookings/${b.id}`} className="ml-2 text-[#1A56DB] hover:text-[#1440A0] shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // Booking is not in a group — show link button
  return (
    <div>
      {!showDialog ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs px-2.5 rounded-sm gap-1 border-[#1A56DB] text-[#1A56DB] hover:bg-[#EEF2FF]"
          onClick={() => { setShowDialog(true); setMode('create'); setNewLabel('') }}
        >
          <Plus className="w-3 h-3" />
          Link to Trip Group
        </Button>
      ) : (
        <div className="border border-[#C3C5D7] rounded-lg p-4 space-y-3 bg-[#F9F9FE]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#191B23]">Link {bookingRef} to a trip group</span>
            <button onClick={() => setShowDialog(false)} className="text-[#737686] hover:text-[#191B23]">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 text-xs">
            <button
              className={`px-2.5 py-1 rounded-sm font-medium transition-colors ${mode === 'create' ? 'bg-[#1A56DB] text-white' : 'bg-[#EDEDF8] text-[#434654] hover:bg-[#D4DCFF]'}`}
              onClick={() => setMode('create')}
            >
              Create new group
            </button>
            <button
              className={`px-2.5 py-1 rounded-sm font-medium transition-colors ${mode === 'link' ? 'bg-[#1A56DB] text-white' : 'bg-[#EDEDF8] text-[#434654] hover:bg-[#D4DCFF]'}`}
              onClick={() => setMode('link')}
            >
              Join existing group
            </button>
          </div>

          {mode === 'create' && (
            <div className="space-y-2">
              <input
                className="w-full text-sm border border-[#C3C5D7] rounded-md px-3 py-1.5 outline-none focus:border-[#1A56DB] bg-white"
                placeholder="Group label e.g. Aravind Kumar Ooty Jun 25–29"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateAndLink() }}
              />
              <Button
                size="sm"
                className="h-7 text-xs px-3 rounded-sm bg-[#1A56DB] hover:bg-[#1440A0] text-white"
                onClick={handleCreateAndLink}
                disabled={saving || !newLabel.trim()}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Create & Link
              </Button>
            </div>
          )}

          {mode === 'link' && (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#737686]" />
                <input
                  className="w-full text-sm border border-[#C3C5D7] rounded-md pl-8 pr-3 py-1.5 outline-none focus:border-[#1A56DB] bg-white"
                  placeholder="Search group by name…"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
              </div>
              {searchResults.length === 0 ? (
                <p className="text-xs text-[#737686]">{searchQ ? 'No groups found.' : 'Start typing to search.'}</p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {searchResults.map(g => (
                    <button
                      key={g.id}
                      className="w-full text-left text-sm px-3 py-1.5 rounded-md hover:bg-[#EEF2FF] text-[#191B23] flex items-center justify-between"
                      onClick={() => linkToGroup(g.id)}
                      disabled={saving}
                    >
                      <span>{g.label}</span>
                      <Link2 className="w-3.5 h-3.5 text-[#1A56DB] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
