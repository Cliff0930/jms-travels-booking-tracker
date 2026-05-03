'use client'
import { useState, use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBooking, useUpdateBooking, useConfirmBooking, useCancelBooking, useSendApproval, useBookingMessages } from '@/hooks/useBookings'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { FlagList } from '@/components/shared/FlagBadge'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { ApproveByCallModal } from '@/components/bookings/ApproveByCallModal'
import { MessageTimeline } from '@/components/bookings/MessageTimeline'
import { SubstituteDriverModal } from '@/components/bookings/SubstituteDriverModal'
import { TripLegsPanel } from '@/components/bookings/TripLegsPanel'
import { TripTimeline } from '@/components/bookings/TripTimeline'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MapPin, Calendar, Clock, Users, Car, ArrowLeft, Phone, CheckCircle, Send, RefreshCw, Pencil, X, History } from 'lucide-react'
import { formatBookingDateTime, formatTimestamp } from '@/lib/utils/date'
import { toast } from 'sonner'
import { format } from 'date-fns'

const CANCEL_REASONS = ['Client Request', 'No Show', 'Operational Issue', 'Other']
const VEHICLE_TYPES = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface EditForm {
  pickup_location: string
  drop_location: string
  pickup_date: string
  pickup_time: string
  pax_count: string
  vehicle_type: string
  trip_type: string
  service_type: string
  total_days: string
  special_instructions: string
  guest_name: string
  guest_phone: string
}

interface EditLogChange {
  field: string
  label: string
  old_value: string
  new_value: string
}

interface EditLog {
  id: string
  changed_by: string
  reason: string
  changes: EditLogChange[]
  changed_at: string
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const qc = useQueryClient()
  const { data: booking, isLoading } = useBooking(id)
  const { data: messages = [] } = useBookingMessages(id)
  const { data: editLogs = [] } = useQuery<EditLog[]>({
    queryKey: ['booking-edit-logs', id],
    queryFn: () => fetch(`/api/bookings/${id}/edit-logs`).then(r => r.json()),
    enabled: !!id,
  })

  const updateBooking = useUpdateBooking()
  const confirmBooking = useConfirmBooking()
  const cancelBooking = useCancelBooking()
  const sendApproval = useSendApproval()

  const [showAssign, setShowAssign] = useState(false)
  const [showSubstitute, setShowSubstitute] = useState(false)
  const [showApproveByCall, setShowApproveByCall] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('Client Request')

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (isLoading) return <div className="py-12 text-center text-[#737686]">Loading booking…</div>
  if (!booking) return <div className="py-12 text-center text-[#737686]">Booking not found</div>

  const clientName = booking.guest_name || booking.client?.name || 'Unknown Client'

  function startEdit() {
    setEditForm({
      pickup_location: booking!.pickup_location || '',
      drop_location: booking!.drop_location || '',
      pickup_date: booking!.pickup_date || '',
      pickup_time: booking!.pickup_time || '',
      pax_count: booking!.pax_count != null ? String(booking!.pax_count) : '',
      vehicle_type: booking!.vehicle_type || '',
      trip_type: booking!.trip_type || 'local',
      service_type: booking!.service_type || 'one_way',
      total_days: String(booking!.total_days ?? 1),
      special_instructions: booking!.special_instructions || '',
      guest_name: booking!.guest_name || '',
      guest_phone: booking!.guest_phone || '',
    })
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setEditForm(null)
  }

  async function handleSave() {
    if (!editForm || !editReason.trim()) return
    setSaving(true)
    try {
      const changes = {
        ...editForm,
        pax_count: editForm.pax_count ? parseInt(editForm.pax_count) : null,
        total_days: parseInt(editForm.total_days) || 1,
      }
      const res = await fetch(`/api/bookings/${id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, reason: editReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['booking-edit-logs', id] })
      toast.success('Booking updated')
      setIsEditing(false)
      setEditForm(null)
      setShowSaveDialog(false)
      setEditReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleApproveByCall(note: string) {
    try {
      await fetch(`/api/bookings/${id}/approve-by-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      toast.success('Verbal approval recorded')
      setShowApproveByCall(false)
      updateBooking.mutate({ id, data: {} })
    } catch {
      toast.error('Failed to record approval')
    }
  }

  async function handleCancel() {
    try {
      await cancelBooking.mutateAsync({ id, reason: cancelReason })
      toast.success('Booking cancelled')
      setShowCancel(false)
    } catch {
      toast.error('Failed to cancel booking')
    }
  }

  async function handleSendApproval() {
    try {
      const result = await sendApproval.mutateAsync(id)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Approval request sent')
      }
    } catch {
      toast.error('Failed to send approval request')
    }
  }

  const f = editForm

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link href="/bookings" className="inline-flex items-center gap-1 text-sm text-[#434654] hover:text-[#191B23] -ml-1 py-1.5 px-2 rounded hover:bg-[#EDEDF8] transition-colors">
          <ArrowLeft className="w-4 h-4" /> Bookings
        </Link>
        <span className="text-[#737686]">/</span>
        <span className="text-sm font-medium text-[#191B23]">{booking.booking_ref}</span>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-semibold text-[#191B23]">{booking.booking_ref}</h1>
        <BookingStatusBadge status={booking.status} />
        {booking.trip_type === 'outstation' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#EDE9FE] text-[#7E3AF2]">Outstation</span>
        )}
        {booking.flags?.length > 0 && <FlagList flags={booking.flags} />}
        {isEditing && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Editing</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Trip Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#191B23]">Trip Details</h2>
              {!isEditing ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7 text-xs rounded-sm border-[#C3C5D7] text-[#434654]"
                  onClick={startEdit}
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs rounded-sm"
                    onClick={cancelEdit}
                  >
                    <X className="w-3 h-3 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs rounded-sm bg-[#1A56DB] hover:bg-[#003FB1]"
                    onClick={() => setShowSaveDialog(true)}
                  >
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label className="flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-[#1A56DB]" />
                  Pickup Location
                  {booking.flags?.includes('missing_pickup') && (
                    <span className="text-xs text-amber-600 font-normal">— Missing</span>
                  )}
                </Label>
                {isEditing && f ? (
                  <Input
                    value={f.pickup_location}
                    onChange={e => setEditForm(p => p ? { ...p, pickup_location: e.target.value } : p)}
                    className="border-[#1A56DB] bg-[#F0F4FF]"
                    placeholder="Enter pickup location"
                  />
                ) : (
                  <div className={`p-2.5 rounded border text-sm ${booking.flags?.includes('missing_pickup') ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-[#C3C5D7] bg-[#F3F3FE] text-[#191B23]'}`}>
                    {booking.pickup_location || 'Not provided'}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <Label className="flex items-center gap-1.5 mb-1">
                  <MapPin className="w-3.5 h-3.5 text-[#737686]" />
                  Drop Location
                  <span className="text-xs text-[#737686] font-normal">— Optional</span>
                </Label>
                {isEditing && f ? (
                  <Input
                    value={f.drop_location}
                    onChange={e => setEditForm(p => p ? { ...p, drop_location: e.target.value } : p)}
                    className="border-[#1A56DB] bg-[#F0F4FF]"
                    placeholder="Enter drop location (optional)"
                  />
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#434654]">
                    {booking.drop_location || 'Not provided — call to confirm'}
                  </div>
                )}
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Calendar className="w-3.5 h-3.5" /> Date
                </Label>
                {isEditing && f ? (
                  <Input
                    type="date"
                    value={f.pickup_date}
                    onChange={e => setEditForm(p => p ? { ...p, pickup_date: e.target.value } : p)}
                    className="border-[#1A56DB] bg-[#F0F4FF]"
                  />
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {formatBookingDateTime(booking.pickup_date, null)}
                  </div>
                )}
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Clock className="w-3.5 h-3.5" /> Time
                </Label>
                {isEditing && f ? (
                  <Input
                    type="time"
                    value={f.pickup_time}
                    onChange={e => setEditForm(p => p ? { ...p, pickup_time: e.target.value } : p)}
                    className="border-[#1A56DB] bg-[#F0F4FF]"
                  />
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.pickup_time || 'Not set'}
                  </div>
                )}
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Users className="w-3.5 h-3.5" /> Passengers
                </Label>
                {isEditing && f ? (
                  <Input
                    type="number"
                    min={1}
                    value={f.pax_count}
                    onChange={e => setEditForm(p => p ? { ...p, pax_count: e.target.value } : p)}
                    className="border-[#1A56DB] bg-[#F0F4FF]"
                    placeholder="e.g. 2"
                  />
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.pax_count || '—'}
                  </div>
                )}
              </div>

              <div>
                <Label className="flex items-center gap-1.5 mb-1">
                  <Car className="w-3.5 h-3.5" /> Vehicle Type
                </Label>
                {isEditing && f ? (
                  <Select value={f.vehicle_type} onValueChange={v => v && setEditForm(p => p ? { ...p, vehicle_type: v } : p)}>
                    <SelectTrigger className="border-[#1A56DB] bg-[#F0F4FF]">
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.vehicle_type || '—'}
                  </div>
                )}
              </div>

              {isEditing && f && (
                <>
                  <div>
                    <Label className="mb-1 block">Trip Type</Label>
                    <Select value={f.trip_type} onValueChange={v => v && setEditForm(p => p ? { ...p, trip_type: v } : p)}>
                      <SelectTrigger className="border-[#1A56DB] bg-[#F0F4FF]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="outstation">Outstation</SelectItem>
                        <SelectItem value="airport">Airport</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1 block">Service Type</Label>
                    <Select value={f.service_type} onValueChange={v => v && setEditForm(p => p ? { ...p, service_type: v } : p)}>
                      <SelectTrigger className="border-[#1A56DB] bg-[#F0F4FF]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_way">One Way</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {f.trip_type === 'outstation' && (
                    <div>
                      <Label className="mb-1 block">Total Days</Label>
                      <Input
                        type="number"
                        min={1}
                        value={f.total_days}
                        onChange={e => setEditForm(p => p ? { ...p, total_days: e.target.value } : p)}
                        className="border-[#1A56DB] bg-[#F0F4FF]"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="mb-1 block">Guest Name</Label>
                    <Input
                      value={f.guest_name}
                      onChange={e => setEditForm(p => p ? { ...p, guest_name: e.target.value } : p)}
                      className="border-[#1A56DB] bg-[#F0F4FF]"
                      placeholder="Override guest name"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block">Guest Phone</Label>
                    <Input
                      value={f.guest_phone}
                      onChange={e => setEditForm(p => p ? { ...p, guest_phone: e.target.value } : p)}
                      className="border-[#1A56DB] bg-[#F0F4FF]"
                      placeholder="e.g. +91 98000 00000"
                    />
                  </div>
                </>
              )}

              <div className="sm:col-span-2">
                <Label className="mb-1 block">Special Instructions</Label>
                {isEditing && f ? (
                  <Textarea
                    value={f.special_instructions}
                    onChange={e => setEditForm(p => p ? { ...p, special_instructions: e.target.value } : p)}
                    className="border-[#1A56DB] bg-[#F0F4FF] resize-none"
                    rows={2}
                    placeholder="Any special instructions…"
                  />
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#434654]">
                    {booking.special_instructions || '—'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-3">Client</h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#D4DCFF] flex items-center justify-center text-sm font-semibold text-[#1A56DB]">
                {clientName.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <div className="font-medium text-[#191B23]">{clientName}</div>
                {booking.company && <div className="text-sm text-[#434654]">{booking.company.name}</div>}
                {booking.flags?.includes('guest_booking') && (
                  <span className="text-xs text-amber-600">Guest booking — not linked to a client account</span>
                )}
                {booking.guest_phone && (
                  <div className="flex items-center gap-1 text-xs text-[#737686] mt-0.5">
                    <Phone className="w-3 h-3" />{booking.guest_phone}
                  </div>
                )}
                {booking.client?.primary_phone && !booking.guest_phone && (
                  <div className="flex items-center gap-1 text-xs text-[#737686] mt-0.5">
                    <Phone className="w-3 h-3" />{booking.client.primary_phone}
                  </div>
                )}
              </div>
            </div>
          </div>

          {booking.driver && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <h2 className="text-base font-semibold text-[#191B23] mb-3">Assigned Driver</h2>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#D4DCFF] flex items-center justify-center text-sm font-semibold text-[#1A56DB]">
                  {booking.driver.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div className="font-medium text-[#191B23]">{booking.driver.name}</div>
                  <div className="text-sm text-[#434654]">{booking.driver.vehicle_name} — {booking.driver.vehicle_number}</div>
                  <div className="flex items-center gap-1 text-xs text-[#737686] mt-0.5">
                    <Phone className="w-3 h-3" />{booking.driver.phone}
                  </div>
                </div>
              </div>
            </div>
          )}

          {booking.total_days > 1 && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <h2 className="text-base font-semibold text-[#191B23] mb-4">
                Trip Legs
                <span className="ml-2 text-sm font-normal text-[#737686]">{booking.total_days} days</span>
              </h2>
              <TripLegsPanel bookingId={booking.id} />
            </div>
          )}

          {booking.approval_status && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <h2 className="text-base font-semibold text-[#191B23] mb-3">Approval</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[#737686]">Status</dt>
                  <dd className="capitalize font-medium text-[#191B23]">{booking.approval_status}</dd>
                </div>
                {booking.approval_method && (
                  <div className="flex justify-between">
                    <dt className="text-[#737686]">Method</dt>
                    <dd className="capitalize text-[#434654]">{booking.approval_method}</dd>
                  </div>
                )}
                {booking.approved_by && (
                  <div className="flex justify-between">
                    <dt className="text-[#737686]">Approved by</dt>
                    <dd className="text-[#434654]">{booking.approved_by}</dd>
                  </div>
                )}
                {booking.approved_at && (
                  <div className="flex justify-between">
                    <dt className="text-[#737686]">Approved at</dt>
                    <dd className="text-xs text-[#434654]">{formatTimestamp(booking.approved_at)}</dd>
                  </div>
                )}
                {booking.approval_note && (
                  <div>
                    <dt className="text-[#737686] mb-0.5">Note</dt>
                    <dd className="text-sm text-[#434654] bg-[#F3F3FE] p-2 rounded border border-[#C3C5D7]">{booking.approval_note}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Message Log */}
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-4">Message Log</h2>
            <MessageTimeline messages={messages} />
          </div>

          {/* Edit History */}
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-[#737686]" />
              Edit History
              {editLogs.length > 0 && (
                <span className="text-xs font-normal text-[#737686]">({editLogs.length} edit{editLogs.length !== 1 ? 's' : ''})</span>
              )}
            </h2>
            {editLogs.length === 0 ? (
              <p className="text-sm text-[#737686]">No manual edits yet.</p>
            ) : (
              <div className="space-y-4">
                {editLogs.map((log) => {
                  const initials = log.changed_by
                    .split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
                  return (
                    <div key={log.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0 mt-0.5">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#191B23]">{log.changed_by}</span>
                          <span className="text-xs text-[#737686]">
                            {format(new Date(log.changed_at), 'd MMM yyyy, h:mm a')}
                          </span>
                        </div>
                        <p className="text-xs text-[#737686] mt-0.5 italic">"{log.reason}"</p>
                        <div className="mt-1.5 space-y-1">
                          {log.changes.map((c, i) => (
                            <div key={i} className="text-xs text-[#434654] flex items-start gap-1.5">
                              <span className="font-medium text-[#191B23] shrink-0">{c.label}:</span>
                              <span className="line-through text-[#737686]">{c.old_value}</span>
                              <span className="text-[#737686]">→</span>
                              <span className="text-[#10B981] font-medium">{c.new_value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions + Info */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-3">Actions</h2>
            <div className="space-y-2">
              {(booking.status === 'confirmed' || booking.status === 'in_progress') && (
                <Button
                  className="w-full bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
                  onClick={() => setShowAssign(true)}
                >
                  {booking.driver_id ? 'Change Driver' : 'Assign Driver'}
                </Button>
              )}
              {(booking.status === 'confirmed' || booking.status === 'in_progress') && booking.driver_id && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm text-[#7E3AF2] border-[#7E3AF2] hover:bg-[#EDE9FE]"
                  onClick={() => setShowSubstitute(true)}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Substitute Vehicle
                </Button>
              )}
              {(booking.status === 'draft' || booking.status === 'pending_approval') && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm"
                  onClick={async () => {
                    await confirmBooking.mutateAsync(id)
                    toast.success('Booking confirmed')
                  }}
                  disabled={confirmBooking.isPending}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Confirm Booking
                </Button>
              )}
              {booking.status === 'pending_approval' && booking.company?.approval_required && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm text-[#1A56DB] border-[#1A56DB] hover:bg-[#EEF2FF]"
                  onClick={handleSendApproval}
                  disabled={sendApproval.isPending}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {sendApproval.isPending ? 'Sending…' : 'Send Approval Request'}
                </Button>
              )}
              {booking.status === 'pending_approval' && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm text-[#7E3AF2] border-[#7E3AF2] hover:bg-[#EDE9FE]"
                  onClick={() => setShowApproveByCall(true)}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Approve by Call
                </Button>
              )}
              {booking.status !== 'completed' && booking.status !== 'cancelled' && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowCancel(true)}
                >
                  Cancel Booking
                </Button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-3">Booking Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#737686]">Reference</dt>
                <dd className="font-medium text-[#191B23]">{booking.booking_ref}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#737686]">Source</dt>
                <dd className="capitalize text-[#434654]">{booking.source}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#737686]">Service</dt>
                <dd className="capitalize text-[#434654]">{booking.service_type.replace('_', ' ')}</dd>
              </div>
              {booking.total_days > 1 && (
                <div className="flex justify-between">
                  <dt className="text-[#737686]">Days</dt>
                  <dd className="text-[#434654]">{booking.total_days}</dd>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between">
                <dt className="text-[#737686]">Created</dt>
                <dd className="text-[#434654] text-xs">{formatTimestamp(booking.created_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-4">Trip Timeline</h2>
            <TripTimeline booking={booking} />
          </div>
        </div>
      </div>

      {showAssign && (
        <AssignDriverModal booking={booking} open={showAssign} onClose={() => setShowAssign(false)} />
      )}
      {showSubstitute && (
        <SubstituteDriverModal booking={booking} open={showSubstitute} onClose={() => setShowSubstitute(false)} />
      )}
      <ApproveByCallModal
        bookingRef={booking.booking_ref}
        open={showApproveByCall}
        onClose={() => setShowApproveByCall(false)}
        onConfirm={handleApproveByCall}
      />

      {/* Cancel Dialog */}
      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Reason</Label>
              <Select value={cancelReason} onValueChange={v => v !== null && setCancelReason(v)}>
                <SelectTrigger className="border-[#C3C5D7]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANCEL_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)}>Keep</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelBooking.isPending} className="rounded-sm">
              {cancelBooking.isPending ? 'Cancelling…' : 'Cancel Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save with reason dialog */}
      <Dialog open={showSaveDialog} onOpenChange={o => { if (!o && !saving) { setShowSaveDialog(false); setEditReason('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reason for Edit</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="mb-1.5 block text-sm">Why are you making this change? *</Label>
            <Textarea
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="e.g. Client changed pickup time, corrected drop location…"
              rows={3}
              className="border-[#C3C5D7] resize-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSaveDialog(false); setEditReason('') }} disabled={saving}>
              Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={!editReason.trim() || saving}
              className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
            >
              {saving ? 'Saving…' : 'Confirm Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
