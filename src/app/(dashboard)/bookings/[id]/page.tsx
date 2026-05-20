'use client'
import { useState, use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBooking, useUpdateBooking, useConfirmBooking, useCancelBooking, useSendApproval, useBookingMessages } from '@/hooks/useBookings'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { FlagList } from '@/components/shared/FlagBadge'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { ApproveByCallModal } from '@/components/bookings/ApproveByCallModal'
import { BookingMessageChat } from '@/components/bookings/BookingMessageChat'
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
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { MapPin, Calendar, Clock, Users, Car, ArrowLeft, Phone, CheckCircle, Send, RefreshCw, Pencil, X, History, AlertCircle, UserPlus, Gauge, Radio, RotateCcw, Building2, AlertTriangle } from 'lucide-react'
import { useCanEdit } from '@/hooks/useCurrentUser'
import { formatBookingDateTime, formatTimestamp } from '@/lib/utils/date'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'

const CANCEL_REASONS = ['Client Request', 'No Show', 'Operational Issue', 'Duplicate Booking', 'Other']
const VEHICLE_TYPES = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']

interface SimilarBooking {
  id: string
  booking_ref: string
  pickup_date: string
  pickup_time: string | null
  pickup_location: string | null
  drop_location: string | null
  guest_name: string | null
  guest_phone: string | null
  status: string
  trip_type: string | null
}

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

  const isPossibleDup = booking?.flags?.includes('possible_duplicate') ?? false
  const { data: similarBookings = [] } = useQuery<SimilarBooking[]>({
    queryKey: ['booking-similar', id],
    queryFn: () => fetch(`/api/bookings/${id}/similar`).then(r => r.json()),
    enabled: isPossibleDup,
  })

  interface TripSheet {
    id: string
    tripsheet_number: string | null
    opening_km: number | null
    closing_km: number | null
    opening_time: string | null
    closing_time: string | null
    opening_lat: number | null
    opening_lng: number | null
    closing_lat: number | null
    closing_lng: number | null
    office_to_pickup_km: number | null
    drop_to_office_km: number | null
    toll_amount: number | null
    parking_amount: number | null
    gps_km: number | null
    route_image_url: string | null
  }

  function formatTripDuration(openingTime: string, closingTime: string, tripType: string): string {
    const diff = new Date(closingTime).getTime() - new Date(openingTime).getTime()
    if (diff <= 0) return '—'
    const totalMinutes = Math.floor(diff / 60000)
    const totalHours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (tripType === 'outstation') {
      const days = Math.floor(totalHours / 24)
      const hours = totalHours % 24
      if (days === 0) return `${totalHours}h ${minutes}m`
      if (hours === 0 && minutes === 0) return `${days} day${days > 1 ? 's' : ''}`
      return `${days} day${days > 1 ? 's' : ''} ${hours}h`
    }
    return `${totalHours}h ${minutes}m`
  }

  const { data: tripSheet } = useQuery<TripSheet | null>({
    queryKey: ['trip-sheet', id],
    queryFn: () => fetch(`/api/bookings/${id}/trip-sheet`).then(r => r.json()),
    enabled: !!id,
    refetchInterval: booking?.status === 'in_progress' ? 15000 : false,
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
  const [savingGuest, setSavingGuest] = useState(false)
  const [showGuestChoiceDialog, setShowGuestChoiceDialog] = useState(false)
  const [guestNameAction, setGuestNameAction] = useState<'update' | 'new' | null>(null)

  // Resend message dialog
  const [showResend, setShowResend] = useState(false)
  const [resendType, setResendType] = useState<'booking_confirmed' | 'driver_details' | 'trip_brief_driver'>('booking_confirmed')
  const [resendChannel, setResendChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [resendRecipient, setResendRecipient] = useState('')
  const [resendSending, setResendSending] = useState(false)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [editReason, setEditReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [applyingLog, setApplyingLog] = useState<string | null>(null)
  const [chasingApproval, setChasingApproval] = useState(false)
  const [dismissingDup, setDismissingDup] = useState(false)
  const [cancellingOther, setCancellingOther] = useState<string | null>(null)
  const [showCompleteEarly, setShowCompleteEarly] = useState(false)
  const [completeEarlyReason, setCompleteEarlyReason] = useState('')
  const [completingEarly, setCompletingEarly] = useState(false)
  const canEdit = useCanEdit()

  if (isLoading) return <div className="py-12 text-center text-[#737686]">Loading booking…</div>
  if (!booking) return <div className="py-12 text-center text-[#737686]">Booking not found</div>

  // Use booking's direct company, or fall back to the coordinator client's company
  const displayCompany = booking.company ?? booking.client?.company ?? null

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

  function handleInitiateSave() {
    if (!editForm) return
    const guestChanged = editForm.guest_name !== (booking!.guest_name || '')
    const hasExistingGuest = !!booking!.guest_client_id
    if (guestChanged && hasExistingGuest) {
      setShowGuestChoiceDialog(true)
    } else {
      setShowSaveDialog(true)
    }
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
        body: JSON.stringify({ changes, reason: editReason, guest_name_action: guestNameAction }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['booking-edit-logs', id] })
      qc.invalidateQueries({ queryKey: ['booking-legs', id] })
      toast.success('Booking updated')
      setIsEditing(false)
      setEditForm(null)
      setShowSaveDialog(false)
      setEditReason('')
      setGuestNameAction(null)
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

  async function handleChaseApproval() {
    setChasingApproval(true)
    try {
      const res = await fetch(`/api/bookings/${id}/chase-approval`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Chase message sent to approvers')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send chase')
    } finally {
      setChasingApproval(false)
    }
  }

  async function handleApplyPending(logId: string, action: 'apply' | 'dismiss') {
    setApplyingLog(logId)
    try {
      const res = await fetch(`/api/bookings/${id}/apply-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId, action }),
      })
      if (!res.ok) throw new Error('Failed')
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['booking-edit-logs', id] })
      toast.success(action === 'apply' ? 'Change applied to booking' : 'Change request dismissed')
    } catch {
      toast.error('Failed to update change request')
    } finally {
      setApplyingLog(null)
    }
  }

  async function handleResend() {
    setResendSending(true)
    try {
      const res = await fetch(`/api/bookings/${id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_type: resendType,
          channel: resendChannel,
          override_recipient: resendRecipient.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Sent via ${resendChannel} to ${json.recipient}`)
      setShowResend(false)
      setResendRecipient('')
      qc.invalidateQueries({ queryKey: ['booking-messages', id] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setResendSending(false)
    }
  }

  async function handleGpsToggle(enabled: boolean) {
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gps_tracking_enabled: enabled }),
      })
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      toast.success(enabled ? 'GPS tracking enabled' : 'GPS tracking disabled')
    } catch {
      toast.error('Failed to update GPS setting')
    }
  }

  async function handleDismissDuplicate() {
    setDismissingDup(true)
    try {
      const newFlags = (booking!.flags || []).filter((f: string) => f !== 'possible_duplicate')
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: newFlags }),
      })
      if (!res.ok) throw new Error('Failed')
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['booking-similar', id] })
      toast.success('Marked as not a duplicate')
    } catch {
      toast.error('Failed to dismiss')
    } finally {
      setDismissingDup(false)
    }
  }

  async function handleCancelOtherBooking(otherId: string, otherRef: string) {
    setCancellingOther(otherId)
    try {
      const res = await fetch(`/api/bookings/${otherId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `Duplicate of ${booking!.booking_ref}` }),
      })
      if (!res.ok) throw new Error('Failed')
      qc.invalidateQueries({ queryKey: ['booking-similar', id] })
      toast.success(`${otherRef} cancelled`)
    } catch {
      toast.error('Failed to cancel')
    } finally {
      setCancellingOther(null)
    }
  }

  async function handleCancelThisAsDuplicate(otherRef: string) {
    try {
      await cancelBooking.mutateAsync({ id, reason: `Duplicate of ${otherRef}` })
      toast.success('Booking cancelled')
    } catch {
      toast.error('Failed to cancel booking')
    }
  }

  async function handleCompleteEarly() {
    setCompletingEarly(true)
    try {
      const res = await fetch(`/api/bookings/${id}/complete-early`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: completeEarlyReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['booking-legs', id] })
      toast.success('Booking completed — remaining legs cancelled')
      setShowCompleteEarly(false)
      setCompleteEarlyReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setCompletingEarly(false)
    }
  }

  async function handleSaveGuest() {
    if (!booking || !booking.guest_name) return
    setSavingGuest(true)
    try {
      const clientRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: booking.guest_name,
          primary_phone: booking.guest_phone || null,
          client_type: 'guest',
          company_id: displayCompany?.id || null,
          guest_of_company_id: displayCompany?.id || null,
        }),
      })
      if (!clientRes.ok) throw new Error('Failed to create guest record')
      const newClient = await clientRes.json()

      const newFlags = (booking.flags || []).filter((f: string) => f !== 'guest_booking')
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_client_id: newClient.id, flags: newFlags }),
      })

      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(`${booking.guest_name} saved to Guest Directory`)
    } catch {
      toast.error('Failed to save guest')
    } finally {
      setSavingGuest(false)
    }
  }

  async function handleSwitchBookingType() {
    if (!canEdit || !booking) return
    const newType = booking.booking_type === 'company' ? 'personal' : 'company'
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_type: newType }),
      })
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      toast.success(`Switched to ${newType === 'company' ? 'Corporate' : 'Personal'}`)
    } catch {
      toast.error('Failed to update booking type')
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
        {booking.booking_type && (
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            booking.booking_type === 'company' ? 'bg-[#EEF2FF] text-[#1A56DB]' : 'bg-[#F3F4F6] text-[#374151]'
          )}>
            {booking.booking_type === 'company' ? 'Corporate' : 'Personal'}
          </span>
        )}
        {booking.trip_type === 'outstation' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#EDE9FE] text-[#7E3AF2]">Outstation</span>
        )}
        {booking.flags?.length > 0 && <FlagList flags={booking.flags} />}
        {isEditing && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Editing</span>
        )}
      </div>

      {isPossibleDup && (
        <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Possible duplicate booking</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This booking shares the same client, date, and{' '}
                {similarBookings.length > 0 ? 'guest or pickup location' : 'details'} as another booking.
                Call the client to confirm, then cancel the duplicate.
              </p>

              {similarBookings.length > 0 && (
                <div className="mt-3 space-y-2">
                  {similarBookings.map(s => (
                    <div key={s.id} className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-[#191B23]">{s.booking_ref}</span>
                          <span className="capitalize text-xs text-[#737686]">{s.status}</span>
                        </div>
                        {s.guest_name && <div className="text-xs text-[#434654] mt-0.5">{s.guest_name}</div>}
                        <div className="text-xs text-[#737686] mt-0.5 truncate">
                          {s.pickup_location}{s.drop_location ? ` → ${s.drop_location}` : ''}
                        </div>
                        <div className="text-xs text-[#737686]">
                          {formatBookingDateTime(s.pickup_date, s.pickup_time)}
                        </div>
                      </div>
                      {canEdit && s.status !== 'cancelled' && s.status !== 'completed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs rounded-sm shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                          disabled={cancellingOther === s.id}
                          onClick={() => handleCancelOtherBooking(s.id, s.booking_ref)}
                        >
                          {cancellingOther === s.id ? 'Cancelling…' : `Cancel ${s.booking_ref}`}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {canEdit && booking.status !== 'cancelled' && booking.status !== 'completed' && similarBookings.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 text-xs rounded-sm text-red-600 border-red-200 hover:bg-red-50"
                    disabled={cancelBooking.isPending}
                    onClick={() => handleCancelThisAsDuplicate(similarBookings[0].booking_ref)}
                  >
                    Cancel This One
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs rounded-sm text-amber-700 border-amber-300 hover:bg-amber-100"
                  disabled={dismissingDup}
                  onClick={handleDismissDuplicate}
                >
                  {dismissingDup ? 'Dismissing…' : 'Not a duplicate — dismiss'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Trip Details */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[#191B23]">Trip Details</h2>
              {canEdit && !isEditing ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7 text-xs rounded-sm border-[#C3C5D7] text-[#434654]"
                  onClick={startEdit}
                >
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
              ) : isEditing ? (
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
                    onClick={handleInitiateSave}
                  >
                    Save Changes
                  </Button>
                </div>
              ) : null}
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
            <h2 className="text-base font-semibold text-[#191B23] mb-4">People & Company</h2>

            {/* Company */}
            {displayCompany && (
              <div className="mb-4 pb-4 border-b border-[#E5E7EB]">
                <div className="text-[10px] font-semibold text-[#737686] uppercase tracking-wider mb-2">Company</div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-[#1A56DB]" />
                  </div>
                  <div>
                    <div className="font-medium text-[#191B23] text-sm">{displayCompany.name}</div>
                    <div className="text-xs text-[#737686]">
                      {booking.booking_type === 'company' ? 'Corporate booking' : 'Personal booking'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Booked by (coordinator / client) */}
            {booking.client && (
              <div className={cn('mb-4 pb-4 border-b border-[#E5E7EB]', !booking.guest_name && 'mb-0 pb-0 border-b-0')}>
                <div className="text-[10px] font-semibold text-[#737686] uppercase tracking-wider mb-2">Booked by</div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#D4DCFF] flex items-center justify-center text-xs font-semibold text-[#1A56DB] shrink-0">
                    {booking.client.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="font-medium text-[#191B23] text-sm">{booking.client.name}</div>
                    {booking.client.primary_phone && (
                      <div className="flex items-center gap-1 text-xs text-[#737686]">
                        <Phone className="w-3 h-3" />
                        <a href={`tel:${booking.client.primary_phone}`} className="hover:underline hover:text-[#1A56DB]">{booking.client.primary_phone}</a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Traveller / Guest */}
            {booking.guest_name ? (
              <div>
                <div className="text-[10px] font-semibold text-[#737686] uppercase tracking-wider mb-2">Traveller</div>
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center text-xs font-semibold text-[#434654] shrink-0">
                    {booking.guest_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="font-medium text-[#191B23] text-sm">{booking.guest_name}</div>
                    {booking.guest_phone && (
                      <div className="flex items-center gap-1 text-xs text-[#737686]">
                        <Phone className="w-3 h-3" />
                        <a href={`tel:${booking.guest_phone}`} className="hover:underline hover:text-[#1A56DB]">{booking.guest_phone}</a>
                      </div>
                    )}
                    {booking.flags?.includes('guest_booking') && canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs px-2 mt-1.5 rounded-sm text-[#7E3AF2] border-[#7E3AF2] hover:bg-[#EDE9FE]"
                        onClick={handleSaveGuest}
                        disabled={savingGuest}
                      >
                        <UserPlus className="w-3 h-3 mr-1" />
                        {savingGuest ? 'Saving…' : 'Save to Guest Directory'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : !booking.client && (
              <div className="text-sm text-[#737686]">No client linked</div>
            )}
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
                    <Phone className="w-3 h-3" />
                    <a href={`tel:${booking.driver.phone}`} className="hover:underline hover:text-[#1A56DB]">{booking.driver.phone}</a>
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
              <TripLegsPanel bookingId={booking.id} driverAssigned={!!booking.driver_id} tripType={booking.trip_type} />
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
            <BookingMessageChat messages={messages} booking={booking} />
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
                  const isPending = log.changed_by.includes('[PENDING]')
                  const isApplied = log.changed_by.includes('[APPLIED]')
                  const isDismissed = log.changed_by.includes('[DISMISSED]')
                  const displayName = log.changed_by
                    .replace(' [PENDING]', '').replace(' [APPLIED]', '').replace(' [DISMISSED]', '')
                  const initials = displayName
                    .split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
                  const avatarClass = isPending
                    ? 'bg-[#FEF3C7] text-[#D97706]'
                    : isApplied
                    ? 'bg-[#D1FAE5] text-[#059669]'
                    : isDismissed
                    ? 'bg-[#F3F4F6] text-[#9CA3AF]'
                    : 'bg-[#D4DCFF] text-[#1A56DB]'
                  return (
                    <div key={log.id} className={`flex gap-3 rounded-lg p-2 -m-2 ${isPending ? 'bg-[#FFFBEB] border border-[#FDE68A]' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5 ${avatarClass}`}>
                        {isPending ? <AlertCircle className="w-3.5 h-3.5" /> : initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#191B23]">{displayName}</span>
                          {isPending && (
                            <span className="text-xs font-medium text-[#D97706] bg-[#FEF3C7] px-1.5 py-0.5 rounded">Pending</span>
                          )}
                          {isApplied && (
                            <span className="text-xs font-medium text-[#059669] bg-[#D1FAE5] px-1.5 py-0.5 rounded">Applied</span>
                          )}
                          {isDismissed && (
                            <span className="text-xs font-medium text-[#9CA3AF] bg-[#F3F4F6] px-1.5 py-0.5 rounded">Dismissed</span>
                          )}
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
                              <span className={`font-medium ${isApplied ? 'text-[#10B981]' : isPending ? 'text-[#D97706]' : 'text-[#10B981]'}`}>{c.new_value}</span>
                            </div>
                          ))}
                        </div>
                        {isPending && canEdit && (
                          <div className="flex gap-2 mt-2">
                            <Button
                              size="sm"
                              className="h-7 px-3 text-xs bg-[#059669] hover:bg-[#047857] rounded-sm"
                              disabled={applyingLog === log.id}
                              onClick={() => handleApplyPending(log.id, 'apply')}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Apply Change
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 text-xs rounded-sm text-[#737686] border-[#C3C5D7] hover:bg-[#F3F4F6]"
                              disabled={applyingLog === log.id}
                              onClick={() => handleApplyPending(log.id, 'dismiss')}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Dismiss
                            </Button>
                          </div>
                        )}
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
          {canEdit && (
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
              {booking.status === 'pending_approval' && displayCompany?.approval_required && (
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
              {booking.status === 'pending_approval' && booking.approval_status === 'pending' && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm text-[#D97706] border-[#FDE68A] hover:bg-[#FFFBEB]"
                  onClick={handleChaseApproval}
                  disabled={chasingApproval}
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {chasingApproval ? 'Sending…' : 'Chase Approval'}
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
              {booking.total_days > 1 && ['confirmed', 'in_progress'].includes(booking.status) && (
                <Button
                  variant="outline"
                  className="w-full rounded-sm text-[#059669] border-[#6EE7B7] hover:bg-[#ECFDF5]"
                  onClick={() => setShowCompleteEarly(true)}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Complete Early
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full rounded-sm text-[#434654] border-[#C3C5D7] hover:bg-[#F3F3FE]"
                onClick={() => {
                  setResendType('booking_confirmed')
                  setResendChannel(booking.source === 'email' ? 'email' : 'whatsapp')
                  setResendRecipient('')
                  setShowResend(true)
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Resend Message
              </Button>
            </div>
          </div>
          )}

          {canEdit && (
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <Radio className={`w-4 h-4 mt-0.5 shrink-0 ${booking.gps_tracking_enabled ? 'text-green-600' : 'text-[#737686]'}`} />
                <div>
                  <h2 className="text-base font-semibold text-[#191B23]">GPS Tracking</h2>
                  <p className="text-xs text-[#737686] mt-0.5">
                    {booking.gps_tracking_enabled
                      ? 'Driver location recorded every 30s during trip'
                      : 'Enable to record driver route during trip'}
                  </p>
                </div>
              </div>
              <Switch
                checked={!!booking.gps_tracking_enabled}
                onCheckedChange={handleGpsToggle}
                className="ml-4 shrink-0"
              />
            </div>
          </div>
          )}

          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-3">Booking Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[#737686]">Reference</dt>
                <dd className="font-medium text-[#191B23]">{booking.booking_ref}</dd>
              </div>
              {displayCompany && (
                <div className="flex justify-between">
                  <dt className="text-[#737686]">Company</dt>
                  <dd className="text-[#434654] font-medium text-right max-w-[60%] truncate">{displayCompany.name}</dd>
                </div>
              )}
              <div className="flex justify-between items-center">
                <dt className="text-[#737686]">Booking Type</dt>
                <dd className="flex items-center gap-1.5">
                  <span className={cn(
                    'text-xs font-medium px-1.5 py-0.5 rounded',
                    booking.booking_type === 'company' ? 'bg-[#EEF2FF] text-[#1A56DB]' : 'bg-[#F3F4F6] text-[#374151]'
                  )}>
                    {booking.booking_type === 'company' ? 'Corporate' : 'Personal'}
                  </span>
                  {canEdit && (
                    <button
                      onClick={handleSwitchBookingType}
                      className="text-xs text-[#737686] hover:text-[#1A56DB] underline-offset-2 hover:underline"
                    >
                      Switch
                    </button>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[#737686]">Source</dt>
                <dd className="capitalize text-[#434654]">{booking.source}</dd>
              </div>
              {booking.requested_by && (
                <div className="flex justify-between">
                  <dt className="text-[#737686]">Requested by</dt>
                  <dd className="text-[#434654] text-xs break-all text-right max-w-[60%]">{booking.requested_by}</dd>
                </div>
              )}
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

          {tripSheet && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <h2 className="text-base font-semibold text-[#191B23] mb-3 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#1A56DB]" />
                Tripsheet
              </h2>
              <dl className="space-y-2 text-sm">
                {tripSheet.tripsheet_number && (
                  <div className="flex justify-between">
                    <dt className="text-[#737686]">Sheet No.</dt>
                    <dd className="font-medium text-[#191B23]">{tripSheet.tripsheet_number}</dd>
                  </div>
                )}
                {(tripSheet.toll_amount != null || tripSheet.parking_amount != null) && (
                  <>
                    {tripSheet.toll_amount != null && (
                      <div className="flex justify-between">
                        <dt className="text-[#737686]">Toll</dt>
                        <dd className="text-[#434654]">₹{tripSheet.toll_amount}</dd>
                      </div>
                    )}
                    {tripSheet.parking_amount != null && (
                      <div className="flex justify-between">
                        <dt className="text-[#737686]">Parking</dt>
                        <dd className="text-[#434654]">₹{tripSheet.parking_amount}</dd>
                      </div>
                    )}
                    <div className="border-b border-[#C3C5D7]" />
                  </>
                )}
                <div className="flex justify-between items-center">
                  <dt className="text-[#737686]">Opening KM</dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-[#434654]">{tripSheet.opening_km != null ? tripSheet.opening_km.toLocaleString() : '—'}</span>
                    {tripSheet.opening_lat != null && tripSheet.opening_lng != null && (
                      <a href={`https://www.google.com/maps?q=${tripSheet.opening_lat},${tripSheet.opening_lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1A56DB] hover:underline flex items-center gap-0.5 shrink-0">
                        <MapPin className="w-3 h-3" /> Pickup
                      </a>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between items-center">
                  <dt className="text-[#737686]">Closing KM</dt>
                  <dd className="flex items-center gap-2">
                    <span className="text-[#434654]">{tripSheet.closing_km != null ? tripSheet.closing_km.toLocaleString() : '—'}</span>
                    {tripSheet.closing_lat != null && tripSheet.closing_lng != null && (
                      <a href={`https://www.google.com/maps?q=${tripSheet.closing_lat},${tripSheet.closing_lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1A56DB] hover:underline flex items-center gap-0.5 shrink-0">
                        <MapPin className="w-3 h-3" /> Drop
                      </a>
                    )}
                  </dd>
                </div>
                {tripSheet.opening_km != null && tripSheet.closing_km != null && (
                  <>
                    <div className="flex justify-between border-t border-[#C3C5D7] pt-2 mt-2">
                      <dt className="text-[#737686]">Driver KM</dt>
                      <dd className="font-medium text-[#191B23]">{(tripSheet.closing_km - tripSheet.opening_km).toFixed(1)} km</dd>
                    </div>
                    {tripSheet.gps_km != null && (
                      <div className="flex justify-between">
                        <dt className="text-[#737686]">GPS KM</dt>
                        <dd className="text-[#434654]">{tripSheet.gps_km.toFixed(1)} km</dd>
                      </div>
                    )}
                    {tripSheet.opening_time && tripSheet.closing_time && (
                      <div className="flex justify-between">
                        <dt className="text-[#737686]">{booking.trip_type === 'outstation' ? 'Trip Duration' : 'Hours Used'}</dt>
                        <dd className="text-[#434654]">{formatTripDuration(tripSheet.opening_time, tripSheet.closing_time, booking.trip_type)}</dd>
                      </div>
                    )}
                    {(tripSheet.office_to_pickup_km != null || tripSheet.drop_to_office_km != null) && (
                      <>
                        <div className="flex justify-between">
                          <dt className="text-[#737686]">Office → Pickup</dt>
                          <dd className="text-[#434654]">{tripSheet.office_to_pickup_km != null ? `${tripSheet.office_to_pickup_km} km` : '—'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[#737686]">Drop → Office</dt>
                          <dd className="text-[#434654]">{tripSheet.drop_to_office_km != null ? `${tripSheet.drop_to_office_km} km` : '—'}</dd>
                        </div>
                        <div className="flex justify-between border-t border-[#C3C5D7] pt-2 mt-2">
                          <dt className="font-medium text-[#191B23]">Grand Total</dt>
                          <dd className="font-semibold text-[#1A56DB]">
                            {(
                              (tripSheet.closing_km - tripSheet.opening_km) +
                              (tripSheet.office_to_pickup_km ?? 0) +
                              (tripSheet.drop_to_office_km ?? 0)
                            ).toFixed(1)} km
                          </dd>
                        </div>
                      </>
                    )}
                  </>
                )}
                {tripSheet.route_image_url && (
                  <div className="mt-3 pt-3 border-t border-[#C3C5D7]">
                    <p className="text-xs text-[#737686] mb-2">Route Map</p>
                    <a href={tripSheet.route_image_url} target="_blank" rel="noopener noreferrer" title="Open full size">
                      <img
                        src={tripSheet.route_image_url}
                        alt="GPS route map"
                        className="w-full rounded-md border border-[#C3C5D7] cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </a>
                  </div>
                )}
              </dl>
            </div>
          )}
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

      {/* Resend Message dialog */}
      <Dialog open={showResend} onOpenChange={o => { if (!o && !resendSending) setShowResend(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Resend Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block text-sm">Message</Label>
              <Select value={resendType} onValueChange={v => v && setResendType(v as typeof resendType)}>
                <SelectTrigger className="border-[#C3C5D7]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="booking_confirmed">Booking Confirmation</SelectItem>
                  {booking.driver_id && <SelectItem value="driver_details">Driver Details to Client</SelectItem>}
                  {booking.driver_id && <SelectItem value="trip_brief_driver">Trip Brief to Driver</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm">Send via</Label>
              <div className="flex rounded-md border border-[#C3C5D7] overflow-hidden text-sm">
                {(['whatsapp', 'email'] as const).map(ch => (
                  <button
                    key={ch}
                    onClick={() => setResendChannel(ch)}
                    className={`flex-1 h-9 border-r last:border-r-0 border-[#C3C5D7] capitalize transition-colors ${
                      resendChannel === ch ? 'bg-[#1A56DB] text-white' : 'bg-white text-[#434654] hover:bg-[#F3F3FE]'
                    }`}
                  >
                    {ch === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm">
                Send to
                <span className="text-xs font-normal text-[#737686] ml-1">— leave blank to use default contact</span>
              </Label>
              <Input
                value={resendRecipient}
                onChange={e => setResendRecipient(e.target.value)}
                placeholder={resendChannel === 'email' ? 'name@example.com' : '+91 98000 00000'}
                className="border-[#C3C5D7]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResend(false)} disabled={resendSending}>Cancel</Button>
            <Button
              onClick={handleResend}
              disabled={resendSending}
              className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              {resendSending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guest changed — ask correction vs new guest */}
      <Dialog open={showGuestChoiceDialog} onOpenChange={o => { if (!o) setShowGuestChoiceDialog(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Guest Changed</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#434654]">You changed the guest name:</p>
            <div className="flex items-center justify-center gap-2 bg-[#F3F3FE] rounded-lg px-3 py-2 text-sm">
              <span className="font-medium text-[#737686]">{booking.guest_name || '—'}</span>
              <span className="text-[#737686]">→</span>
              <span className="font-medium text-[#191B23]">{editForm?.guest_name || '—'}</span>
            </div>
            <p className="text-xs text-[#737686]">Is this a correction to the same person, or a completely different guest?</p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full justify-start rounded-sm border-[#C3C5D7]"
              onClick={() => { setGuestNameAction('update'); setShowGuestChoiceDialog(false); setShowSaveDialog(true) }}
            >
              <Pencil className="w-4 h-4 mr-2 text-[#737686]" />
              Correction — update {booking.guest_name}&apos;s profile
            </Button>
            <Button
              className="w-full justify-start rounded-sm bg-[#1A56DB] hover:bg-[#003FB1]"
              onClick={() => { setGuestNameAction('new'); setShowGuestChoiceDialog(false); setShowSaveDialog(true) }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              New guest — save {editForm?.guest_name} separately
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Early dialog */}
      <Dialog open={showCompleteEarly} onOpenChange={o => { if (!o && !completingEarly) { setShowCompleteEarly(false); setCompleteEarlyReason('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete Booking Early</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[#434654]">
              This will cancel all remaining upcoming legs and mark the booking as <span className="font-medium text-[#059669]">Completed</span>.
            </p>
            <div>
              <Label className="mb-1.5 block text-sm">Reason (optional)</Label>
              <Textarea
                value={completeEarlyReason}
                onChange={e => setCompleteEarlyReason(e.target.value)}
                placeholder="e.g. Client no longer needs the vehicle from Day 4"
                rows={2}
                className="border-[#C3C5D7] resize-none"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCompleteEarly(false); setCompleteEarlyReason('') }} disabled={completingEarly}>
              Cancel
            </Button>
            <Button
              onClick={handleCompleteEarly}
              disabled={completingEarly}
              className="bg-[#059669] hover:bg-[#047857] rounded-sm"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
              {completingEarly ? 'Completing…' : 'Complete Early'}
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
