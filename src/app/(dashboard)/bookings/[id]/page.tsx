'use client'
import { useState, use, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useBooking, useUpdateBooking, useConfirmBooking, useCancelBooking, useSendApproval, useBookingMessages } from '@/hooks/useBookings'
import { BookingStatusBadge } from '@/components/shared/StatusBadge'
import { FlagList } from '@/components/shared/FlagBadge'
import { AssignDriverModal } from '@/components/bookings/AssignDriverModal'
import { ApproveByCallModal } from '@/components/bookings/ApproveByCallModal'
import { BookingMessageChat } from '@/components/bookings/BookingMessageChat'
import { SubstituteDriverModal } from '@/components/bookings/SubstituteDriverModal'
import { TripLegsPanel } from '@/components/bookings/TripLegsPanel'
import { TripGroupPanel } from '@/components/bookings/TripGroupPanel'
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
import { MapPin, Calendar, Clock, Users, Car, ArrowLeft, Phone, CheckCircle, Send, RefreshCw, Pencil, X, History, AlertCircle, UserPlus, Gauge, Radio, RotateCcw, Building2, AlertTriangle, Zap, ChevronDown, Trash2, Lock, Copy, Navigation, Plus } from 'lucide-react'
import type { PickupStop } from '@/types'
import { WaBadge } from '@/components/shared/WaBadge'
import { GuestSearchCombobox } from '@/components/shared/GuestSearchCombobox'
import { useCanEdit, useIsAdmin } from '@/hooks/useCurrentUser'
import { formatBookingDateTime, formatTimestamp } from '@/lib/utils/date'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'

const CANCEL_REASONS = ['Client Request', 'No Show', 'Operational Issue', 'Duplicate Booking', 'Other']
const VEHICLE_TYPES = ['Sedan', 'SUV', 'MUV', 'Van', 'Tempo', 'Bus', 'Luxury']
const EDIT_REASONS = ['Client request', 'Booking correction', 'Schedule change', 'Data entry error', 'Operator update', 'Other']

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

  interface ApiCostRow {
    api_type: string
    call_type: string
    tokens_in: number | null
    tokens_out: number | null
    cost_usd: number
    created_at: string
  }
  const [showCosts, setShowCosts] = useState(false)
  const [inrRate, setInrRate] = useState<number | null>(null)
  const { data: apiCosts = [] } = useQuery<ApiCostRow[]>({
    queryKey: ['api-costs', id],
    queryFn: () => fetch(`/api/bookings/${id}/api-costs`).then(r => r.json()),
    enabled: showCosts && !!id,
  })
  useEffect(() => {
    if (!showCosts || inrRate !== null) return
    fetch('https://api.frankfurter.app/latest?from=USD&to=INR')
      .then(r => r.json())
      .then((d: { rates?: { INR?: number } }) => { if (d.rates?.INR) setInrRate(d.rates.INR) })
      .catch(() => {})
  }, [showCosts, inrRate])

  const isPossibleDup = booking?.flags?.includes('possible_duplicate') ?? false
  const isNeedsClarification = booking?.flags?.includes('needs_clarification') ?? false
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
    manual_opening_time: string | null
    manual_closing_time: string | null
    opening_lat: number | null
    opening_lng: number | null
    closing_lat: number | null
    closing_lng: number | null
    office_to_pickup_km: number | null
    drop_to_office_km: number | null
    toll_amount: number | null
    parking_amount: number | null
    permit_amount: number | null
    bata_driver: number | null
    bata_client: number | null
    driver_opening_km: number | null
    driver_closing_km: number | null
    driver_opening_time: string | null
    driver_closing_time: string | null
    client_opening_km: number | null
    client_closing_km: number | null
    client_opening_time: string | null
    client_closing_time: string | null
    gps_km: number | null
    route_image_url: string | null
    slab_override: string | null
    leg?: { day_number: number; leg_date: string } | null
    invoiced?: boolean
  }

  function parseHHMM(t: string): number | null {
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return null
    return h * 60 + m
  }

  function calcManualDuration(open: string, close: string): string {
    const [oh, om] = open.split(':').map(Number)
    const [ch, cm] = close.split(':').map(Number)
    let mins = (ch * 60 + cm) - (oh * 60 + om)
    if (mins < 0) mins += 24 * 60
    const h = Math.floor(mins / 60), m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
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

  const { data: tripSheets = [], refetch: refetchTripSheet } = useQuery<TripSheet[]>({
    queryKey: ['trip-sheet', id],
    queryFn: () => fetch(`/api/bookings/${id}/trip-sheet`).then(r => r.json()),
    enabled: !!id,
    refetchInterval: booking?.status === 'in_progress' ? 15000 : false,
  })

  interface CollectionEntry { id: string; amount: number; payment_mode: string; status: string }
  const { data: collectionEntries = [] } = useQuery<CollectionEntry[]>({
    queryKey: ['booking-collection', id],
    queryFn: () => fetch(`/api/driver-advances?status=outstanding&booking_id=${id}`)
      .then(r => r.json())
      .then((d: CollectionEntry[]) => d.filter((e: CollectionEntry & { type?: string }) => e.type === 'collection')),
    enabled: !!id && booking?.status === 'completed',
  })
  const settledCollection = useQuery<CollectionEntry[]>({
    queryKey: ['booking-collection-settled', id],
    queryFn: () => fetch(`/api/driver-advances?status=settled&booking_id=${id}`)
      .then(r => r.json())
      .then((d: CollectionEntry[]) => d.filter((e: CollectionEntry & { type?: string }) => e.type === 'collection')),
    enabled: !!id && booking?.status === 'completed',
  })
  const allCollections = [...collectionEntries, ...(settledCollection.data ?? [])]

  // Billing + settlement status for completed bookings
  const { data: billStatus } = useQuery<{
    invoice_number: string | null; invoice_id: string | null; invoice_status: string | null
    cash_bill_number: string | null; cash_bill_id: string | null; cash_bill_status: string | null
    settlement_ref: string | null; settled: boolean
  }>({
    queryKey: ['booking-bill-status', id],
    queryFn: () => fetch(`/api/bookings/${id}/billing-status`).then(r => r.json()),
    enabled: !!id && booking?.status === 'completed',
  })

  const [selectedSheetIdx, setSelectedSheetIdx] = useState(0)
  const tripSheet = tripSheets[selectedSheetIdx] ?? null

  // Auto-refresh tripsheet when booking transitions to completed
  const prevBookingStatus = useRef(booking?.status)
  useEffect(() => {
    if (prevBookingStatus.current === 'in_progress' && booking?.status === 'completed') {
      void refetchTripSheet()
    }
    prevBookingStatus.current = booking?.status
  }, [booking?.status])

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

  // Resend message dialog
  const [showResend, setShowResend] = useState(false)
  const [resendType, setResendType] = useState<'booking_confirmed' | 'driver_details' | 'trip_brief_driver'>('booking_confirmed')
  const [resendChannel, setResendChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [resendRecipient, setResendRecipient] = useState('')
  const [resendSending, setResendSending] = useState(false)

  // Copy message dialog
  const [showCopyMessage, setShowCopyMessage] = useState(false)
  const [copyType, setCopyType] = useState<'booking_confirmed' | 'driver_details' | 'trip_brief_driver'>('booking_confirmed')
  const [copyChannel, setCopyChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [copyPreview, setCopyPreview] = useState<{ body: string; subject: string } | null>(null)
  const [copyLoading, setCopyLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // Per-field inline edit state
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldDraft, setFieldDraft] = useState<string>('')
  const [fieldDraft2, setFieldDraft2] = useState<string>('')
  const [fieldDraftPhone, setFieldDraftPhone] = useState<string>('')
  const [stopsEditorDraft, setStopsEditorDraft] = useState<{ location: string; time: string; guest: string; phone: string }[]>([])
  const [fieldReason, setFieldReason] = useState<string>('')
  const [fieldReasonOther, setFieldReasonOther] = useState<string>('')
  const [savingField, setSavingField] = useState(false)
  const [applyingLog, setApplyingLog] = useState<string | null>(null)
  const [chasingApproval, setChasingApproval] = useState(false)
  const [dismissingDup, setDismissingDup] = useState(false)
  const [dismissingClarification, setDismissingClarification] = useState(false)
  const [cancellingOther, setCancellingOther] = useState<string | null>(null)
  const [showCompleteEarly, setShowCompleteEarly] = useState(false)
  const [completeEarlyReason, setCompleteEarlyReason] = useState('')
  const [completingEarly, setCompletingEarly] = useState(false)
  const [overridingStatus, setOverridingStatus] = useState(false)
  const [editingSheet, setEditingSheet] = useState(false)
  const [sheetEditForm, setSheetEditForm] = useState<{
    tripsheet_number: string; opening_km: string; closing_km: string
    manual_opening_time: string; manual_closing_time: string
    toll_amount: string; parking_amount: string; permit_amount: string
    bata_driver: string; bata_client: string
    driver_opening_km: string; driver_closing_km: string
    driver_opening_time: string; driver_closing_time: string
    client_opening_km: string; client_closing_km: string
    client_opening_time: string; client_closing_time: string
    slab_override: string | null
  } | null>(null)
  const [sheetViewTab, setSheetViewTab] = useState<'actual' | 'driver' | 'client'>('actual')
  const [savingSheet, setSavingSheet] = useState(false)
  const canEdit = useCanEdit()
  const isAdmin = useIsAdmin()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  // Billing vehicle override
  const [billingVehicle, setBillingVehicle] = useState<string | null>(null)
  const [savingBillingVehicle, setSavingBillingVehicle] = useState(false)
  useEffect(() => {
    if (booking) setBillingVehicle((booking as { billing_vehicle_type?: string | null }).billing_vehicle_type ?? null)
  }, [booking?.id])
  const { data: rateCardVehicles = [] } = useQuery<string[]>({
    queryKey: ['rate-cards-vehicles'],
    queryFn: () => fetch('/api/billing/rate-cards').then(r => r.json()).then((d: { vehicle_type: string }[]) => d.map(r => r.vehicle_type)),
  })
  async function handleSaveBillingVehicle(value: string | null) {
    setBillingVehicle(value)
    setSavingBillingVehicle(true)
    try {
      await fetch(`/api/bookings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ billing_vehicle_type: value }) })
      toast.success(value ? `Billing as ${value}` : 'Reset to driver vehicle')
      qc.invalidateQueries({ queryKey: ['booking', id] })
    } catch {
      toast.error('Failed to save')
    } finally {
      setSavingBillingVehicle(false)
    }
  }

  // Auto-calculate and auto-save both bata counts whenever times change or edit form opens
  const lastAutoSavedBata = useRef<string | null>(null)
  useEffect(() => {
    if (!editingSheet || !sheetEditForm || !tripSheet) return
    const openMins  = parseHHMM(sheetEditForm.manual_opening_time)
    const closeMins = parseHHMM(sheetEditForm.manual_closing_time)
    const midnightCross = closeMins !== null && openMins !== null && closeMins < openMins
    const outstationDays = booking?.trip_type === 'outstation' ? (booking.total_days || 1) : 0
    // Driver thresholds: open < 05:30, close > 22:30
    const driverLateNight = closeMins !== null && (closeMins > 22 * 60 + 30 || midnightCross) ? 1 : 0
    const driverEarlyMorn = openMins  !== null && openMins < 5 * 60 + 30 ? 1 : 0
    const autoBataDriver = driverLateNight + driverEarlyMorn + outstationDays
    // Client thresholds: open < 06:00, close > 22:00
    const clientLateNight = closeMins !== null && (closeMins > 22 * 60 || midnightCross) ? 1 : 0
    const clientEarlyMorn = openMins  !== null && openMins < 6 * 60 ? 1 : 0
    const autoBataClient = clientLateNight + clientEarlyMorn + outstationDays
    setSheetEditForm(f => f ? { ...f, bata_driver: String(autoBataDriver), bata_client: String(autoBataClient) } : f)
    const key = `${autoBataDriver}:${autoBataClient}`
    if (lastAutoSavedBata.current !== key) {
      lastAutoSavedBata.current = key
      void fetch(`/api/bookings/${id}/trip-sheet?sheetId=${tripSheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bata_driver: autoBataDriver, bata_client: autoBataClient }),
      }).then(() => void refetchTripSheet())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSheet, sheetEditForm?.manual_opening_time, sheetEditForm?.manual_closing_time, tripSheet?.id])

  if (isLoading) return <div className="py-12 text-center text-[#737686]">Loading booking…</div>
  if (!booking) return <div className="py-12 text-center text-[#737686]">Booking not found</div>

  // Use booking's direct company, or fall back to the coordinator client's company
  const displayCompany = booking.company ?? booking.client?.company ?? null

  function startField(name: string, value: string, value2 = '') {
    setEditingField(name)
    setFieldDraft(value)
    setFieldDraft2(value2)
    setFieldDraftPhone('')
    setFieldReason('')
    setFieldReasonOther('')
  }

  function cancelField() {
    setEditingField(null)
    setFieldDraft('')
    setFieldDraft2('')
    setFieldDraftPhone('')
    setFieldReason('')
    setFieldReasonOther('')
    setStopsEditorDraft([])
  }

  function startStopsEditor() {
    if (!booking) return
    const existing = booking.pickup_stops as PickupStop[] | null
    setStopsEditorDraft(
      existing && existing.length >= 2
        ? existing.map(s => ({ location: s.location, time: s.time || '', guest: s.guest || '', phone: s.guest_phone || '' }))
        : [
            { location: booking.pickup_location || '', time: '', guest: '', phone: '' },
            { location: '', time: '', guest: '', phone: '' },
          ]
    )
    setEditingField('pickup_stops')
    setFieldDraft('')
    setFieldDraft2('')
    setFieldDraftPhone('')
    setFieldReason('')
    setFieldReasonOther('')
  }

  async function handleFieldSave() {
    const reason = fieldReason === 'Other' ? fieldReasonOther.trim() : fieldReason
    if (!reason) { toast.error('Please select a reason'); return }
    if (!editingField) return
    setSavingField(true)
    try {
      let changes: Record<string, unknown>
      if (editingField === 'pickup_stops') {
        const validStops = stopsEditorDraft
          .filter(s => s.location.trim())
          .map((s, i) => ({ order: i + 1, location: s.location.trim(), time: s.time.trim() || null, guest: s.guest.trim() || null, guest_phone: s.phone.trim() || null }))
        if (validStops.length === 1) {
          toast.error('Add at least 2 pickup stop addresses, or remove all stops for single pickup')
          setSavingField(false)
          return
        }
        changes = validStops.length >= 2
          ? { pickup_stops: validStops, pickup_location: validStops[0].location }
          : { pickup_stops: null }
      } else if (editingField === 'total_days_date') {
        changes = { pickup_date: fieldDraft, total_days: parseInt(fieldDraft2) || 1 }
      } else {
        let value: unknown = fieldDraft
        if (editingField === 'pax_count') value = fieldDraft ? parseInt(fieldDraft) : null
        if (editingField === 'total_days') value = parseInt(fieldDraft) || 1
        if (editingField === 'pickup_location_url' || editingField === 'drop_location_url') value = fieldDraft.trim() || null
        changes = { [editingField]: value }
        if (editingField === 'guest_name' && fieldDraftPhone) changes.guest_phone = fieldDraftPhone
      }
      const res = await fetch(`/api/bookings/${id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      qc.invalidateQueries({ queryKey: ['booking-edit-logs', id] })
      qc.invalidateQueries({ queryKey: ['booking-legs', id] })
      cancelField()
      toast.success('Saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingField(false)
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

  async function fetchCopyPreview(type: string, channel: string) {
    setCopyLoading(true)
    setCopyPreview(null)
    setCopied(false)
    try {
      const res = await fetch(`/api/bookings/${id}/message-preview?type=${type}&channel=${channel}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setCopyPreview(json)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load preview')
    } finally {
      setCopyLoading(false)
    }
  }

  async function handleCopyToClipboard() {
    if (!copyPreview) return
    const text = copyChannel === 'email'
      ? `Subject: ${copyPreview.subject}\n\n${copyPreview.body}`
      : copyPreview.body
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
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

  async function handleExcludeFromBillingToggle(excluded: boolean) {
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exclude_from_billing: excluded }),
      })
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      toast.success(excluded ? 'Booking excluded from billing' : 'Booking included in billing')
    } catch {
      toast.error('Failed to update billing exclusion')
    }
  }

  async function handleSettlementToggle(enabled: boolean) {
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_settlement_duty: enabled }),
      })
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      toast.success(enabled ? 'Settlement duty enabled' : 'Settlement duty disabled')
    } catch {
      toast.error('Failed to update settlement duty')
    }
  }

  async function handleDismissClarification() {
    setDismissingClarification(true)
    try {
      const newFlags = (booking!.flags || []).filter((f: string) => f !== 'needs_clarification')
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: newFlags }),
      })
      if (!res.ok) throw new Error('Failed')
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      toast.success('Clarification dismissed')
    } catch {
      toast.error('Failed to dismiss')
    } finally {
      setDismissingClarification(false)
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

  async function handleOverrideStatus(newStatus: 'confirmed' | 'in_progress' | 'completed') {
    setOverridingStatus(true)
    try {
      const res = await fetch(`/api/bookings/${id}/override-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      qc.invalidateQueries({ queryKey: ['bookings', id] })
      void refetchTripSheet()
      toast.success(`Status updated to ${newStatus.replace('_', ' ')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed')
    } finally {
      setOverridingStatus(false)
    }
  }

  function startEditSheet(sheet: TripSheet) {
    setSheetEditForm({
      tripsheet_number:    sheet.tripsheet_number    ?? '',
      opening_km:          sheet.opening_km          != null ? String(sheet.opening_km)    : '',
      closing_km:          sheet.closing_km           != null ? String(sheet.closing_km)    : '',
      manual_opening_time: sheet.manual_opening_time ?? '',
      manual_closing_time: sheet.manual_closing_time ?? '',
      toll_amount:         sheet.toll_amount         != null ? String(sheet.toll_amount)   : '',
      parking_amount:      sheet.parking_amount      != null ? String(sheet.parking_amount): '',
      permit_amount:       sheet.permit_amount       != null ? String(sheet.permit_amount) : '',
      bata_driver:         sheet.bata_driver         != null ? String(sheet.bata_driver)   : '',
      bata_client:         sheet.bata_client         != null ? String(sheet.bata_client)   : '',
      // Pre-fill driver/client adjustments from their saved values, falling back to actual
      driver_opening_km:   String(sheet.driver_opening_km  ?? sheet.opening_km  ?? ''),
      driver_closing_km:   String(sheet.driver_closing_km  ?? sheet.closing_km  ?? ''),
      driver_opening_time: sheet.driver_opening_time  ?? sheet.manual_opening_time ?? '',
      driver_closing_time: sheet.driver_closing_time  ?? sheet.manual_closing_time ?? '',
      client_opening_km:   String(sheet.client_opening_km  ?? sheet.opening_km  ?? ''),
      client_closing_km:   String(sheet.client_closing_km  ?? sheet.closing_km  ?? ''),
      client_opening_time: sheet.client_opening_time  ?? sheet.manual_opening_time ?? '',
      client_closing_time: sheet.client_closing_time  ?? sheet.manual_closing_time ?? '',
      slab_override: sheet.slab_override ?? null,
    })
    setEditingSheet(true)
  }

  async function handleSaveSheet() {
    if (!sheetEditForm || !tripSheet) return
    setSavingSheet(true)
    try {
      const body = {
        tripsheet_number:    sheetEditForm.tripsheet_number    || null,
        opening_km:          sheetEditForm.opening_km          !== '' ? Number(sheetEditForm.opening_km)    : null,
        closing_km:          sheetEditForm.closing_km           !== '' ? Number(sheetEditForm.closing_km)    : null,
        manual_opening_time: sheetEditForm.manual_opening_time || null,
        manual_closing_time: sheetEditForm.manual_closing_time || null,
        toll_amount:         sheetEditForm.toll_amount         !== '' ? Number(sheetEditForm.toll_amount)   : null,
        parking_amount:      sheetEditForm.parking_amount      !== '' ? Number(sheetEditForm.parking_amount): null,
        permit_amount:       sheetEditForm.permit_amount       !== '' ? Number(sheetEditForm.permit_amount) : null,
        bata_driver:         sheetEditForm.bata_driver         !== '' ? Number(sheetEditForm.bata_driver)   : null,
        bata_client:         sheetEditForm.bata_client         !== '' ? Number(sheetEditForm.bata_client)   : null,
        driver_opening_km:   sheetEditForm.driver_opening_km   !== '' ? Number(sheetEditForm.driver_opening_km)  : null,
        driver_closing_km:   sheetEditForm.driver_closing_km   !== '' ? Number(sheetEditForm.driver_closing_km)  : null,
        driver_opening_time: sheetEditForm.driver_opening_time  || null,
        driver_closing_time: sheetEditForm.driver_closing_time  || null,
        client_opening_km:   sheetEditForm.client_opening_km   !== '' ? Number(sheetEditForm.client_opening_km)  : null,
        client_closing_km:   sheetEditForm.client_closing_km   !== '' ? Number(sheetEditForm.client_closing_km)  : null,
        client_opening_time: sheetEditForm.client_opening_time  || null,
        client_closing_time: sheetEditForm.client_closing_time  || null,
        slab_override: sheetEditForm.slab_override ?? null,
      }
      const res = await fetch(`/api/bookings/${id}/trip-sheet?sheetId=${tripSheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await refetchTripSheet()
      setEditingSheet(false)
      setSheetEditForm(null)
      toast.success('Tripsheet updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingSheet(false)
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
          findOrCreate: true,
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
        body: JSON.stringify({ guest_client_id: newClient.id, guest_name: newClient.name, flags: newFlags }),
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

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success('Booking deleted')
      window.location.href = '/bookings'
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete booking')
      setDeleting(false)
    }
  }

  async function handleDuplicate() {
    setDuplicating(true)
    try {
      const res = await fetch(`/api/bookings/${id}/duplicate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast.success(`Duplicated as ${json.booking_ref} — edit the details below`)
      window.location.href = `/bookings/${json.id}`
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate booking')
    } finally {
      setDuplicating(false)
    }
  }

  const reasonPickerJSX = (
    <div className="mt-2 space-y-2 p-2.5 bg-[#F8F9FF] rounded border border-[#C3C5D7]">
      <p className="text-[10px] font-semibold text-[#737686] uppercase tracking-wider">Reason for change</p>
      <select
        value={fieldReason}
        onChange={e => setFieldReason(e.target.value)}
        className="w-full h-8 text-xs border border-[#C3C5D7] rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A56DB]"
      >
        <option value="">Select reason…</option>
        {EDIT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {fieldReason === 'Other' && (
        <Input
          value={fieldReasonOther}
          onChange={e => setFieldReasonOther(e.target.value)}
          placeholder="Describe the reason…"
          className="h-8 text-xs"
        />
      )}
      <div className="flex gap-2 pt-0.5">
        <Button
          size="sm"
          className="h-7 text-xs bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm"
          onClick={handleFieldSave}
          disabled={savingField || !fieldReason || (fieldReason === 'Other' && !fieldReasonOther.trim())}
        >
          {savingField ? 'Saving…' : '✓ Save'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs rounded-sm" onClick={cancelField}>
          ✗ Cancel
        </Button>
      </div>
    </div>
  )

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
        {/* Billing + settlement status badges — only on completed trips */}
        {booking.status === 'completed' && !booking.exclude_from_billing && billStatus && (
          <>
            {billStatus.invoice_id
              ? <a href={`/billing/invoices/${billStatus.invoice_id}`} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 whitespace-nowrap">
                  Invoice: {billStatus.invoice_number ?? 'Draft'}
                </a>
              : billStatus.cash_bill_id
              ? <a href={`/billing/cash-bills/${billStatus.cash_bill_id}`} className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 hover:bg-green-100 whitespace-nowrap">
                  Cash Bill: {billStatus.cash_bill_number ?? 'Draft'}
                </a>
              : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 whitespace-nowrap">
                  Not Billed
                </span>}
            {billStatus.settled
              ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 whitespace-nowrap">Settled</span>
              : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600 whitespace-nowrap">Not Settled</span>}
          </>
        )}
        {editingField && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Editing</span>
        )}
        {isAdmin && booking.status !== 'in_progress' && booking.status !== 'completed' && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 px-3 text-xs text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
          </Button>
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

      {isNeedsClarification && (
        <div className="mb-5 rounded-lg border border-orange-300 bg-orange-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">Needs clarification before confirming</p>
              <p className="text-xs text-orange-700 mt-0.5">
                {booking.special_instructions?.includes('⚠️ CLARIFY:')
                  ? booking.special_instructions.split('\n').find((l: string) => l.includes('⚠️ CLARIFY:'))
                  : 'Review the special instructions, call the client if needed, then dismiss.'}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs rounded-sm text-orange-700 border-orange-300 hover:bg-orange-100"
                  disabled={dismissingClarification}
                  onClick={handleDismissClarification}
                >
                  {dismissingClarification ? 'Dismissing…' : 'Clarified — dismiss'}
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
            <h2 className="text-base font-semibold text-[#191B23] mb-4">Trip Details</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Pickup Location */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#1A56DB]" />
                    Pickup Location
                    {booking.flags?.includes('missing_pickup') && (
                      <span className="text-xs text-amber-600 font-normal">— Missing</span>
                    )}
                  </Label>
                  {canEdit && !editingField && (
                    <div className="flex items-center gap-1">
                      {!(booking.pickup_stops as PickupStop[] | null)?.length && (
                        <button onClick={startStopsEditor}
                          className="flex items-center gap-1 text-[10px] font-medium text-[#737686] hover:text-[#1A56DB] px-1.5 py-0.5 rounded hover:bg-[#EDEDF8] transition-colors">
                          <Plus className="w-3 h-3" /> Stops
                        </button>
                      )}
                      <button onClick={() => startField('pickup_location', booking.pickup_location || '')}
                              className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {editingField === 'pickup_location' ? (
                  <>
                    <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                           className="border-[#1A56DB] bg-[#F0F4FF]" placeholder="Enter pickup location" />
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className={`p-2.5 rounded border text-sm ${booking.flags?.includes('missing_pickup') ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-[#C3C5D7] bg-[#F3F3FE] text-[#191B23]'}`}>
                    {booking.pickup_location || 'Not provided'}
                    {editingField === 'pickup_location_url' ? (
                      <>
                        <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                               className="mt-1.5 border-[#1A56DB] bg-[#F0F4FF] text-xs h-7" placeholder="https://maps.app.goo.gl/…" />
                        {reasonPickerJSX}
                      </>
                    ) : booking.pickup_location_url ? (
                      <div className="mt-1 flex items-center gap-1">
                        <a href={booking.pickup_location_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[#1A56DB] hover:underline flex-1 min-w-0 truncate">
                          <MapPin className="w-3 h-3 shrink-0" /> Open in Google Maps
                        </a>
                        {canEdit && !editingField && (
                          <>
                            <button onClick={() => startField('pickup_location_url', booking.pickup_location_url || '')}
                                    className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] shrink-0" title="Edit map link">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => startField('pickup_location_url', '')}
                                    className="p-0.5 rounded hover:bg-red-50 text-[#737686] hover:text-red-500 shrink-0" title="Remove map link">
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      canEdit && !editingField && (
                        <button onClick={() => startField('pickup_location_url', '')}
                                className="mt-1 flex items-center gap-1 text-xs text-[#737686] hover:text-[#1A56DB] hover:underline">
                          <MapPin className="w-3 h-3" /> + Add map link
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Multi-stop picks — editor when editing, read-only otherwise */}
              {(() => {
                const stops = booking.pickup_stops as PickupStop[] | null
                const hasStops = stops && stops.length >= 2

                if (editingField === 'pickup_stops') {
                  return (
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="flex items-center gap-1.5">
                          <Navigation className="w-3.5 h-3.5 text-[#737686]" />
                          Pickup Stops
                        </Label>
                        {hasStops && (
                          <button type="button" onClick={() => setStopsEditorDraft([])}
                            className="flex items-center gap-1 text-xs text-[#737686] hover:text-red-500 hover:underline">
                            <X className="w-3 h-3" /> Remove all stops
                          </button>
                        )}
                      </div>
                      {stopsEditorDraft.length === 0 ? (
                        <p className="text-sm text-[#737686] italic mb-2">All stops removed — saving will revert to single pickup.</p>
                      ) : (
                        <div className="space-y-2 mb-2">
                          {stopsEditorDraft.map((stop, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-[#1A56DB] text-white text-[10px] flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                              <Input
                                value={stop.location}
                                onChange={e => setStopsEditorDraft(d => d.map((s, j) => j === i ? { ...s, location: e.target.value } : s))}
                                placeholder={`Stop ${i + 1} address`}
                                className="border-[#1A56DB] bg-[#F0F4FF] flex-1 min-w-0"
                                autoFocus={i === 0}
                              />
                              <Input
                                type="time"
                                value={stop.time}
                                onChange={e => setStopsEditorDraft(d => d.map((s, j) => j === i ? { ...s, time: e.target.value } : s))}
                                className="border-[#1A56DB] bg-[#F0F4FF] w-28 shrink-0"
                              />
                              <Input
                                value={stop.guest}
                                onChange={e => setStopsEditorDraft(d => d.map((s, j) => j === i ? { ...s, guest: e.target.value } : s))}
                                placeholder="Guest name"
                                className="border-[#1A56DB] bg-[#F0F4FF] w-24 shrink-0"
                              />
                              <Input
                                value={stop.phone}
                                onChange={e => setStopsEditorDraft(d => d.map((s, j) => j === i ? { ...s, phone: e.target.value } : s))}
                                placeholder="Phone"
                                className="border-[#1A56DB] bg-[#F0F4FF] w-28 shrink-0"
                                inputMode="tel"
                              />
                              {stopsEditorDraft.length > 2 && (
                                <button type="button"
                                  onClick={() => setStopsEditorDraft(d => d.filter((_, j) => j !== i))}
                                  className="text-[#9CA3AF] hover:text-red-500 shrink-0">
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button type="button"
                            onClick={() => setStopsEditorDraft(d => [...d, { location: '', time: '', guest: '', phone: '' }])}
                            className="flex items-center gap-1 text-xs text-[#1A56DB] hover:underline mt-1">
                            <Plus className="w-3 h-3" /> Add stop
                          </button>
                        </div>
                      )}
                      {reasonPickerJSX}
                    </div>
                  )
                }

                if (!hasStops) return null
                return (
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-2">
                      <Label className="flex items-center gap-1.5">
                        <Navigation className="w-3.5 h-3.5 text-[#737686]" />
                        Pickup Stops
                        <span className="text-xs text-[#737686] font-normal">— Multi-stop trip</span>
                      </Label>
                      {canEdit && !editingField && (
                        <button onClick={startStopsEditor}
                          className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="rounded border border-[#C3C5D7] bg-[#F3F3FE] divide-y divide-[#E4E4F0]">
                      {stops.map(s => (
                        <div key={s.order} className="flex items-start gap-3 px-3 py-2 text-sm">
                          <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-[#1A56DB] text-white text-xs flex items-center justify-center font-medium">{s.order}</span>
                          <span className="flex-1 text-[#191B23]">{s.location}</span>
                          {s.time && <span className="flex-shrink-0 text-[#737686] tabular-nums">{s.time}</span>}
                          {s.guest && <span className="flex-shrink-0 text-[#434654] font-medium">{s.guest}</span>}
                          {s.guest_phone && (
                            <a href={`tel:${s.guest_phone}`} className="flex-shrink-0 text-[#1A56DB] tabular-nums text-xs hover:underline">{s.guest_phone}</a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Drop Location */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#737686]" />
                    Drop Location
                    <span className="text-xs text-[#737686] font-normal">— Optional</span>
                  </Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('drop_location', booking.drop_location || '')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'drop_location' ? (
                  <>
                    <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                           className="border-[#1A56DB] bg-[#F0F4FF]" placeholder="Enter drop location (optional)" />
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#434654]">
                    {booking.drop_location || 'Not provided — call to confirm'}
                    {editingField === 'drop_location_url' ? (
                      <>
                        <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                               className="mt-1.5 border-[#1A56DB] bg-[#F0F4FF] text-xs h-7" placeholder="https://maps.app.goo.gl/…" />
                        {reasonPickerJSX}
                      </>
                    ) : booking.drop_location_url ? (
                      <div className="mt-1 flex items-center gap-1">
                        <a href={booking.drop_location_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[#1A56DB] hover:underline flex-1 min-w-0 truncate">
                          <MapPin className="w-3 h-3 shrink-0" /> Open in Google Maps
                        </a>
                        {canEdit && !editingField && (
                          <>
                            <button onClick={() => startField('drop_location_url', booking.drop_location_url || '')}
                                    className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] shrink-0" title="Edit map link">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => startField('drop_location_url', '')}
                                    className="p-0.5 rounded hover:bg-red-50 text-[#737686] hover:text-red-500 shrink-0" title="Remove map link">
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      canEdit && !editingField && (
                        <button onClick={() => startField('drop_location_url', '')}
                                className="mt-1 flex items-center gap-1 text-xs text-[#737686] hover:text-[#1A56DB] hover:underline">
                          <MapPin className="w-3 h-3" /> + Add map link
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* Date — pencil opens the combined date+days widget */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('total_days_date', booking.pickup_date || '', String(booking.total_days ?? 1))}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                  {formatBookingDateTime(booking.pickup_date, null)}
                </div>
              </div>

              {/* Time */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Time</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('pickup_time', booking.pickup_time || '')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'pickup_time' ? (
                  <>
                    <Input type="time" value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                           className="border-[#1A56DB] bg-[#F0F4FF]" />
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.pickup_time || 'Not set'}
                  </div>
                )}
              </div>

              {/* Combined Date + Days widget — shown full-width when either pencil is active */}
              {editingField === 'total_days_date' && (
                <div className="sm:col-span-2 rounded-xl border-2 border-[#1A56DB] bg-[#F0F4FF] p-4 space-y-4">
                  <p className="text-xs font-semibold text-[#1A56DB] uppercase tracking-wider">Edit Date &amp; Days</p>

                  {/* Date picker */}
                  <div>
                    <Label className="mb-1.5 block text-xs text-[#737686]">Pickup Date</Label>
                    <Input
                      type="date"
                      value={fieldDraft}
                      onChange={e => setFieldDraft(e.target.value)}
                      autoFocus
                      className="border-[#1A56DB] bg-white"
                    />
                  </div>

                  {/* Day stepper */}
                  <div>
                    <Label className="mb-1.5 block text-xs text-[#737686]">Total Days</Label>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setFieldDraft2(d => String(Math.max(1, parseInt(d || '1') - 1)))}
                        className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-[#C3C5D7] bg-white text-xl font-bold text-[#434654] hover:border-[#1A56DB] hover:text-[#1A56DB] transition-colors"
                      >−</button>
                      <span className="text-3xl font-bold text-[#191B23] w-10 text-center tabular-nums">
                        {fieldDraft2 || '1'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setFieldDraft2(d => String(parseInt(d || '1') + 1))}
                        className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-[#C3C5D7] bg-white text-xl font-bold text-[#434654] hover:border-[#1A56DB] hover:text-[#1A56DB] transition-colors"
                      >+</button>
                      <span className="text-sm text-[#737686]">{parseInt(fieldDraft2 || '1') === 1 ? 'day' : 'days'}</span>
                    </div>
                  </div>

                  {/* Calculated end date */}
                  {fieldDraft && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-white rounded-lg border border-[#C3C5D7]">
                      <Calendar className="w-3.5 h-3.5 text-[#1A56DB] shrink-0" />
                      <span className="text-xs text-[#737686]">End date:</span>
                      <span className="text-sm font-semibold text-[#191B23]">
                        {(() => {
                          const [y, m, d] = fieldDraft.split('-').map(Number)
                          const end = new Date(y, m - 1, d)
                          end.setDate(end.getDate() + (parseInt(fieldDraft2 || '1') - 1))
                          return format(end, 'd MMM yyyy')
                        })()}
                      </span>
                    </div>
                  )}

                  {reasonPickerJSX}
                </div>
              )}

              {/* Passengers */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Passengers</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('pax_count', String(booking.pax_count ?? ''))}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'pax_count' ? (
                  <>
                    <Input type="number" min={1} value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                           className="border-[#1A56DB] bg-[#F0F4FF]" placeholder="e.g. 2" />
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.pax_count || '—'}
                  </div>
                )}
              </div>

              {/* Vehicle Type */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="flex items-center gap-1.5"><Car className="w-3.5 h-3.5" /> Vehicle Type</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('vehicle_type', booking.vehicle_type || '')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'vehicle_type' ? (
                  <>
                    <Select value={fieldDraft} onValueChange={v => setFieldDraft(v ?? '')}>
                      <SelectTrigger className="border-[#1A56DB] bg-[#F0F4FF]"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>{VEHICLE_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.vehicle_type || '—'}
                  </div>
                )}
              </div>

              {/* Trip Type */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Trip Type</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('trip_type', booking.trip_type || 'local')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'trip_type' ? (
                  <>
                    <Select value={fieldDraft} onValueChange={v => setFieldDraft(v ?? '')}>
                      <SelectTrigger className="border-[#1A56DB] bg-[#F0F4FF]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local</SelectItem>
                        <SelectItem value="outstation">Outstation</SelectItem>
                        <SelectItem value="airport">Airport</SelectItem>
                      </SelectContent>
                    </Select>
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23] capitalize">
                    {booking.trip_type || '—'}
                  </div>
                )}
              </div>

              {/* Service Type */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Service Type</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('service_type', booking.service_type || 'one_way')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'service_type' ? (
                  <>
                    <Select value={fieldDraft} onValueChange={v => setFieldDraft(v ?? '')}>
                      <SelectTrigger className="border-[#1A56DB] bg-[#F0F4FF]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_way">One Way</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                      </SelectContent>
                    </Select>
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                    {booking.service_type === 'one_way' ? 'One Way' : booking.service_type === 'return' ? 'Return' : (booking.service_type || '—')}
                  </div>
                )}
              </div>

              {/* Total Days — pencil opens combined date+days widget */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Total Days</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('total_days_date', booking.pickup_date || '', String(booking.total_days ?? 1))}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#191B23]">
                  {booking.total_days ?? 1}
                </div>
              </div>

              {/* Guest Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Guest Name</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('guest_name', booking.guest_name || '')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'guest_name' ? (
                  <>
                    <GuestSearchCombobox
                      companyId={booking?.company_id ?? null}
                      value={fieldDraft}
                      onChange={name => { setFieldDraft(name); setFieldDraftPhone('') }}
                      onSelect={(name, phone) => { setFieldDraft(name); setFieldDraftPhone(phone ?? '') }}
                      placeholder="Search guest directory or type name"
                      className="[&_input]:border-[#1A56DB] [&_input]:bg-[#F0F4FF]"
                    />
                    {fieldDraftPhone && (
                      <p className="mt-1 text-xs text-[#1A56DB]">Phone will also update to: {fieldDraftPhone}</p>
                    )}
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#434654]">
                    {booking.guest_name || '—'}
                  </div>
                )}
              </div>

              {/* Guest Phone */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Guest Phone</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('guest_phone', booking.guest_phone || '')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'guest_phone' ? (
                  <>
                    <Input value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                           className="border-[#1A56DB] bg-[#F0F4FF]" placeholder="e.g. +91 98000 00000" />
                    {reasonPickerJSX}
                  </>
                ) : (
                  <div className="p-2.5 rounded border border-[#C3C5D7] bg-[#F3F3FE] text-sm text-[#434654]">
                    {booking.guest_phone || '—'}
                  </div>
                )}
              </div>

              {/* Special Instructions */}
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <Label>Special Instructions</Label>
                  {canEdit && !editingField && (
                    <button onClick={() => startField('special_instructions', booking.special_instructions || '')}
                            className="p-0.5 rounded hover:bg-[#EDEDF8] text-[#737686] hover:text-[#434654] transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {editingField === 'special_instructions' ? (
                  <>
                    <Textarea value={fieldDraft} onChange={e => setFieldDraft(e.target.value)} autoFocus
                              className="border-[#1A56DB] bg-[#F0F4FF] resize-none" rows={2}
                              placeholder="Any special instructions…" />
                    {reasonPickerJSX}
                  </>
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
                        <WaBadge phone={booking.guest_phone} />
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
                    <WaBadge phone={booking.driver.phone} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {booking.total_days > 1 && booking.status === 'confirmed' && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <h2 className="text-base font-semibold text-[#191B23] mb-4">
                Trip Legs
                <span className="ml-2 text-sm font-normal text-[#737686]">{booking.total_days} days</span>
              </h2>
              <TripLegsPanel bookingId={booking.id} driverAssigned={!!booking.driver_id} tripType={booking.trip_type} />
            </div>
          )}

          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <h2 className="text-base font-semibold text-[#191B23] mb-4">Trip Group</h2>
            <TripGroupPanel
              bookingId={booking.id}
              bookingRef={booking.booking_ref}
              tripGroupId={booking.trip_group_id ?? null}
            />
          </div>

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

          {/* API Cost Breakdown */}
          <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
            <button
              className="w-full flex items-center justify-between group"
              onClick={() => setShowCosts(v => !v)}
            >
              <h2 className="text-base font-semibold text-[#191B23] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#737686]" />
                API Cost Breakdown
              </h2>
              <ChevronDown className={`w-4 h-4 text-[#737686] transition-transform ${showCosts ? 'rotate-180' : ''}`} />
            </button>

            {showCosts && (() => {
              const API_LABELS: Record<string, string> = {
                gemini: 'Gemini AI',
                maps_static: 'Maps (Static)',
                maps_distance: 'Maps (Distance)',
                whatsapp: 'WhatsApp',
                email: 'Email (Gmail)',
              }
              type GroupRow = { calls: number; tokens_in: number; tokens_out: number; cost_usd: number }
              const grouped: Record<string, GroupRow> = {}
              for (const row of apiCosts) {
                if (!grouped[row.api_type]) grouped[row.api_type] = { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 }
                grouped[row.api_type].calls++
                grouped[row.api_type].tokens_in += row.tokens_in ?? 0
                grouped[row.api_type].tokens_out += row.tokens_out ?? 0
                grouped[row.api_type].cost_usd += row.cost_usd
              }
              const totalUsd = Object.values(grouped).reduce((s, r) => s + r.cost_usd, 0)
              const fmt = (n: number) => `$${n < 0.0001 && n > 0 ? n.toExponential(2) : n.toFixed(4)}`
              const fmtInr = (usd: number) => inrRate ? `₹${(usd * inrRate).toFixed(2)}` : null

              return (
                <div className="mt-4">
                  {apiCosts.length === 0 ? (
                    <p className="text-sm text-[#737686]">No API calls recorded for this booking yet.</p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {Object.entries(grouped).map(([type, row]) => (
                          <div key={type} className="rounded-md border border-[#E5E7EB] p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-[#191B23]">{API_LABELS[type] ?? type}</span>
                              <div className="text-right">
                                <span className="text-sm font-semibold text-[#1A56DB]">{fmt(row.cost_usd)}</span>
                                {fmtInr(row.cost_usd) && (
                                  <span className="ml-1.5 text-xs text-[#737686]">{fmtInr(row.cost_usd)}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-[#737686] space-y-0.5">
                              <span>{row.calls} call{row.calls !== 1 ? 's' : ''}</span>
                              {(type === 'gemini') && (
                                <span className="ml-3">
                                  {row.tokens_in.toLocaleString()} in · {row.tokens_out.toLocaleString()} out tokens
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 pt-3 border-t border-[#E5E7EB] flex justify-between items-baseline">
                        <span className="text-sm font-semibold text-[#191B23]">Total</span>
                        <div className="text-right">
                          <span className="text-base font-bold text-[#1A56DB]">{fmt(totalUsd)}</span>
                          {fmtInr(totalUsd) && (
                            <span className="ml-2 text-sm font-semibold text-[#434654]">{fmtInr(totalUsd)}</span>
                          )}
                          {!inrRate && <span className="ml-2 text-xs text-[#737686]">fetching INR…</span>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })()}
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
                <>
                  <Button
                    variant="outline"
                    className="w-full rounded-sm"
                    onClick={async () => {
                      await confirmBooking.mutateAsync({ id })
                      toast.success('Booking confirmed')
                    }}
                    disabled={confirmBooking.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Confirm Booking
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-sm text-amber-600 border-amber-300 hover:bg-amber-50"
                    onClick={async () => {
                      await confirmBooking.mutateAsync({ id, skipNotification: true })
                      toast.success('Booking confirmed — no message sent. Assign driver to notify client.')
                    }}
                    disabled={confirmBooking.isPending}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Confirm Silently (Urgent)
                  </Button>
                </>
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
              {booking.status === 'cancelled' && booking.driver_id && (
                <div className="border-t border-[#C3C5D7] pt-2 mt-1 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686]">Restore Booking</p>
                  <Button
                    variant="outline"
                    className="w-full rounded-sm text-[#2563EB] border-[#BFDBFE] hover:bg-[#EFF6FF]"
                    disabled={overridingStatus}
                    onClick={() => { if (confirm('Restore this booking to Confirmed (Driver Assigned)? The driver will be set back to on_duty.')) void handleOverrideStatus('confirmed') }}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" /> Restore to Driver Assigned
                  </Button>
                </div>
              )}
              {booking.driver_id && !['cancelled'].includes(booking.status) && (
                <div className="border-t border-[#C3C5D7] pt-2 mt-1 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#737686]">Force Status</p>
                  {booking.status === 'confirmed' && (
                    <Button
                      variant="outline"
                      className="w-full rounded-sm text-[#D97706] border-[#FDE68A] hover:bg-[#FFFBEB]"
                      disabled={overridingStatus}
                      onClick={() => { if (confirm('Mark trip as Arrived / In Progress?')) void handleOverrideStatus('in_progress') }}
                    >
                      <Radio className="w-4 h-4 mr-2" /> Mark Arrived
                    </Button>
                  )}
                  {(booking.status === 'confirmed' || booking.status === 'in_progress') && (
                    <Button
                      variant="outline"
                      className="w-full rounded-sm text-[#059669] border-[#6EE7B7] hover:bg-[#ECFDF5]"
                      disabled={overridingStatus}
                      onClick={() => { if (confirm('Force complete this trip? Driver will be released.')) void handleOverrideStatus('completed') }}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> Force Complete
                    </Button>
                  )}
                  {booking.status === 'in_progress' && (
                    <Button
                      variant="outline"
                      className="w-full rounded-sm text-[#737686] border-[#C3C5D7] hover:bg-[#F3F3FE]"
                      disabled={overridingStatus}
                      onClick={() => { if (confirm('Revert trip back to Confirmed?')) void handleOverrideStatus('confirmed') }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Revert to Confirmed
                    </Button>
                  )}
                  {booking.status === 'completed' && (
                    <Button
                      variant="outline"
                      className="w-full rounded-sm text-[#737686] border-[#C3C5D7] hover:bg-[#F3F3FE]"
                      disabled={overridingStatus}
                      onClick={() => { if (confirm('Revert trip back to In Progress?')) void handleOverrideStatus('in_progress') }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" /> Revert to In Progress
                    </Button>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                className="w-full rounded-sm text-[#7E3AF2] border-[#C4B5FD] hover:bg-[#EDE9FE]"
                onClick={handleDuplicate}
                disabled={duplicating}
              >
                <Copy className="w-4 h-4 mr-2" />
                {duplicating ? 'Duplicating…' : 'Duplicate Booking'}
              </Button>
              <Link
                href={`/bookings/offline-trip?from=${booking!.id}`}
                className="w-full inline-flex items-center justify-center rounded-sm border border-[#C4B5FD] text-[#7E3AF2] hover:bg-[#EDE9FE] text-sm font-medium h-9 px-3 transition-colors"
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate as Offline Trip
              </Link>
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
              <Button
                variant="outline"
                className="w-full rounded-sm text-[#434654] border-[#C3C5D7] hover:bg-[#F3F3FE]"
                onClick={() => {
                  const defaultType = 'booking_confirmed'
                  const defaultChannel = 'whatsapp'
                  setCopyType(defaultType)
                  setCopyChannel(defaultChannel)
                  setCopyPreview(null)
                  setCopied(false)
                  setShowCopyMessage(true)
                  void fetchCopyPreview(defaultType, defaultChannel)
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Copy Message
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

          {canEdit && (
          <div className={cn('rounded-lg border p-5', booking.is_settlement_duty ? 'bg-amber-50 border-amber-300' : 'bg-white border-[#C3C5D7]')}>
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${booking.is_settlement_duty ? 'text-amber-600' : 'text-[#737686]'}`} />
                <div>
                  <h2 className="text-base font-semibold text-[#191B23]">Settlement Duty</h2>
                  <p className="text-xs text-[#737686] mt-0.5">
                    {booking.is_settlement_duty
                      ? 'Driver will collect trip fare from client directly at trip end'
                      : 'Enable if client will pay driver directly at trip end'}
                  </p>
                </div>
              </div>
              <Switch
                checked={!!booking.is_settlement_duty}
                onCheckedChange={handleSettlementToggle}
                className="ml-4 shrink-0"
              />
            </div>
          </div>
          )}

          {canEdit && (
          <div className={cn('rounded-lg border p-5', booking.exclude_from_billing ? 'bg-red-50 border-red-300' : 'bg-white border-[#C3C5D7]')}>
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-2">
                <X className={`w-4 h-4 mt-0.5 shrink-0 ${booking.exclude_from_billing ? 'text-red-500' : 'text-[#737686]'}`} />
                <div>
                  <h2 className="text-base font-semibold text-[#191B23]">Exclude from Billing</h2>
                  <p className="text-xs text-[#737686] mt-0.5">
                    {booking.exclude_from_billing
                      ? 'This trip will not appear in invoice generation or unbilled alerts'
                      : 'Enable to permanently exclude this trip from being invoiced'}
                  </p>
                </div>
              </div>
              <Switch
                checked={!!booking.exclude_from_billing}
                onCheckedChange={handleExcludeFromBillingToggle}
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
              {booking.is_settlement_duty && (
                <>
                  <Separator className="my-1" />
                  <div className="flex justify-between items-start">
                    <dt className="text-amber-700 font-medium">Settlement Duty</dt>
                    <dd className="text-right">
                      {allCollections.length > 0 ? allCollections.map(c => (
                        <div key={c.id} className="text-xs">
                          <span className="font-semibold text-gray-900">₹{Number(c.amount).toLocaleString('en-IN')} via {c.payment_mode === 'cc' ? 'Card' : c.payment_mode.charAt(0).toUpperCase() + c.payment_mode.slice(1)}</span>
                          {' '}<span className={c.status === 'settled' ? 'text-emerald-600' : 'text-orange-600'}>● {c.status === 'settled' ? 'Settled' : 'Outstanding'}</span>
                        </div>
                      )) : (
                        <span className="text-xs text-amber-600">Driver to collect from client</span>
                      )}
                    </dd>
                  </div>
                </>
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

          {booking?.driver_id && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-[#191B23] flex items-center gap-2">
                  <Car className="w-4 h-4 text-amber-600" />
                  Billing Vehicle
                </h2>
                {billingVehicle && (
                  <button
                    onClick={() => handleSaveBillingVehicle(null)}
                    disabled={savingBillingVehicle}
                    className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                  >
                    <X className="w-3 h-3" /> Reset to auto
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs text-[#737686]">
                  {billingVehicle
                    ? <span>Billing at <span className="font-semibold text-amber-700">{billingVehicle}</span> rate — overrides driver vehicle for both client invoice and driver settlement.</span>
                    : <span>Auto — using driver vehicle <span className="font-semibold">{(booking as { driver?: { vehicle_name?: string } | null }).driver?.vehicle_name ?? '—'}</span> rate.</span>
                  }
                </p>
                <Select
                  value={billingVehicle ?? ''}
                  onValueChange={(v: string | null) => { if (v) handleSaveBillingVehicle(v) }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    {billingVehicle
                      ? <span>{billingVehicle}</span>
                      : <span className="text-muted-foreground">Select vehicle to bill as…</span>
                    }
                  </SelectTrigger>
                  <SelectContent>
                    {rateCardVehicles.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {tripSheets.length > 0 && (
            <div className="bg-white rounded-lg border border-[#C3C5D7] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-[#191B23] flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-[#1A56DB]" />
                  Tripsheet
                </h2>
                <div className="flex items-center gap-3">
                  {canEdit && tripSheet && !editingSheet && !tripSheet.invoiced && (
                    <button onClick={() => startEditSheet(tripSheet)} className="text-xs text-[#1A56DB] hover:underline flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                  )}
                  {tripSheet?.invoiced && (
                    <span className="text-xs text-gray-400 flex items-center gap-1" title="Cancel the invoice to edit this tripsheet">
                      <Lock className="w-3 h-3" /> Invoiced
                    </span>
                  )}
                  <button onClick={() => void refetchTripSheet()} className="text-xs text-[#737686] hover:text-[#1A56DB] flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
              </div>

              {/* Day tabs for local multi-day trips */}
              {tripSheets.length > 1 && (
                <div className="flex gap-1 mb-4 border-b border-[#E5E7EB]">
                  {tripSheets.map((s, idx) => {
                    const tabLabel = (() => {
                      const dateStr = s.leg?.leg_date ?? booking.pickup_date
                      if (dateStr) {
                        const [y, m, d] = dateStr.split('-')
                        return `${d}/${m}/${y.slice(2)}`
                      }
                      return `Day ${s.leg?.day_number ?? (idx + 1)}`
                    })()
                    const isActive = idx === selectedSheetIdx
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedSheetIdx(idx)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors ${
                          isActive
                            ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EEF2FF]'
                            : 'border-transparent text-[#737686] hover:text-[#434654] hover:bg-[#F9F9FE]'
                        }`}
                      >
                        {tabLabel}
                      </button>
                    )
                  })}
                </div>
              )}

              {tripSheet && tripSheet.tripsheet_number && (
                <p className="text-xs text-[#737686] mb-3">Sheet No. <span className="font-semibold text-[#191B23]">{tripSheet.tripsheet_number}</span></p>
              )}

              {tripSheet && editingSheet && sheetEditForm && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-4 mb-4 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#D97706]">Edit Tripsheet</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-[#737686]">Sheet No.</Label>
                      <Input className="h-8 text-sm mt-1" value={sheetEditForm.tripsheet_number} onChange={e => setSheetEditForm(f => f && ({ ...f, tripsheet_number: e.target.value }))} placeholder="e.g. 2001" />
                    </div>
                    <div />
                  </div>

                  {/* Billing Slab Override */}
                  {(() => {
                    const SLABS = [
                      { id: '4HR', label: '4hr/40km' },
                      { id: 'AIRPORT', label: 'Airport' },
                      { id: '8HR', label: '8hr/80km' },
                      { id: 'OUTSTATION', label: 'Outstation' },
                    ]
                    const autoSlab = booking.trip_type === 'outstation' ? 'OUTSTATION' : booking.trip_type === 'airport' ? 'AIRPORT' : (() => {
                      const openKm = parseFloat(sheetEditForm.opening_km || '0')
                      const closeKm = parseFloat(sheetEditForm.closing_km || '0')
                      const kms = closeKm > openKm ? closeKm - openKm : 0
                      const o = parseHHMM(sheetEditForm.manual_opening_time)
                      const c = parseHHMM(sheetEditForm.manual_closing_time)
                      const mins = o != null && c != null ? (c < o ? c + 1440 - o : c - o) : 0
                      return kms <= 40 && mins <= 4 * 60 + 105 ? '4HR' : '8HR'
                    })()
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-[#737686]">Billing Slab</Label>
                          {sheetEditForm.slab_override && (
                            <button onClick={() => setSheetEditForm(f => f && ({ ...f, slab_override: null }))} className="text-[10px] text-gray-400 hover:text-gray-600">
                              Reset to auto
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {SLABS.map(sl => {
                            const isOverride = sheetEditForm.slab_override === sl.id
                            const isAuto = !sheetEditForm.slab_override && sl.id === autoSlab
                            return (
                              <button
                                key={sl.id}
                                onClick={() => setSheetEditForm(f => f && ({ ...f, slab_override: f.slab_override === sl.id ? null : sl.id }))}
                                className={cn(
                                  'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                                  isOverride && 'bg-blue-600 border-blue-600 text-white',
                                  isAuto && 'bg-emerald-600 border-emerald-600 text-white',
                                  !isAuto && !isOverride && 'bg-white border-gray-200 text-gray-500 hover:border-gray-400',
                                )}
                              >
                                {sl.label}{isAuto && <span className="ml-1 opacity-75 font-normal text-[10px]">auto</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-[#737686]">Opening KM</Label>
                      <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.opening_km} onChange={e => setSheetEditForm(f => f && ({ ...f, opening_km: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs text-[#737686]">Closing KM</Label>
                      <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.closing_km} onChange={e => setSheetEditForm(f => f && ({ ...f, closing_km: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs text-[#737686]">Opening Time</Label>
                      <Input type="time" className="h-8 text-sm mt-1" value={sheetEditForm.manual_opening_time} onChange={e => setSheetEditForm(f => f && ({ ...f, manual_opening_time: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-[#737686]">Closing Time</Label>
                      <Input type="time" className="h-8 text-sm mt-1" value={sheetEditForm.manual_closing_time} onChange={e => setSheetEditForm(f => f && ({ ...f, manual_closing_time: e.target.value }))} />
                    </div>
                  </div>

                  {/* Bata — auto-calculated, shown as info */}
                  {(() => {
                    const openMins  = parseHHMM(sheetEditForm.manual_opening_time)
                    const closeMins = parseHHMM(sheetEditForm.manual_closing_time)
                    const midnightCross = closeMins !== null && openMins !== null && closeMins < openMins
                    const outstationDays = booking.trip_type === 'outstation' ? (booking.total_days || 1) : 0
                    const driverLateNight = closeMins !== null && (closeMins > 22 * 60 + 30 || midnightCross) ? 1 : 0
                    const driverEarlyMorn = openMins  !== null && openMins < 5 * 60 + 30 ? 1 : 0
                    const bataDrv = driverLateNight + driverEarlyMorn + outstationDays
                    const clientLateNight = closeMins !== null && (closeMins > 22 * 60 || midnightCross) ? 1 : 0
                    const clientEarlyMorn = openMins  !== null && openMins < 6 * 60 ? 1 : 0
                    const bataCli = clientLateNight + clientEarlyMorn + outstationDays
                    const driverRate = booking.trip_type === 'outstation'
                      ? (booking.driver?.bata_rate_outstation ?? booking.driver?.bata_rate ?? 300)
                      : (booking.driver?.bata_rate ?? 300)
                    const isAirport = booking.trip_type === 'airport'
                    const driverBreakdown = [
                      driverLateNight > 0 && `Late night +1`,
                      driverEarlyMorn > 0 && `Early start +1`,
                      outstationDays > 0  && `Outstation +${outstationDays}`,
                    ].filter(Boolean).join(' · ')
                    const clientBreakdown = [
                      clientLateNight > 0 && `Late night +1`,
                      clientEarlyMorn > 0 && `Early start +1`,
                      outstationDays > 0  && `Outstation +${outstationDays}`,
                    ].filter(Boolean).join(' · ')
                    if (bataDrv === 0 && bataCli === 0 && !sheetEditForm.manual_opening_time && !sheetEditForm.manual_closing_time) return null
                    return (
                      <div className="bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg px-3 py-2 space-y-1">
                        {!isAirport && (
                          <div className="text-xs text-[#4F46E5]">
                            <span className="font-semibold text-[#3730A3]">Driver:</span>
                            <span className="font-semibold ml-1">{bataDrv} × ₹{driverRate} = ₹{bataDrv * driverRate}</span>
                            {driverBreakdown && <span className="ml-1 text-[#6366F1]">({driverBreakdown})</span>}
                          </div>
                        )}
                        <div className="text-xs text-[#4F46E5]">
                          <span className="font-semibold text-[#3730A3]">Client:</span>
                          <span className="font-semibold ml-1">{bataCli} bata billed</span>
                          {clientBreakdown && <span className="ml-1 text-[#6366F1]">({clientBreakdown})</span>}
                          {isAirport && <span className="ml-1 text-[#818CF8]">· driver not paid</span>}
                        </div>
                        <div className="text-[10px] text-[#818CF8]">auto-saved</div>
                      </div>
                    )
                  })()}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-[#737686]">Bata Count <span className="text-[#818CF8]">(auto)</span></Label>
                      <Input
                        type="number"
                        min="0"
                        className="h-8 text-sm mt-1"
                        value={sheetEditForm.bata_driver}
                        onChange={e => setSheetEditForm(f => f && ({ ...f, bata_driver: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-[#737686]">Toll (₹)</Label>
                      <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.toll_amount} onChange={e => setSheetEditForm(f => f && ({ ...f, toll_amount: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs text-[#737686]">Parking (₹)</Label>
                      <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.parking_amount} onChange={e => setSheetEditForm(f => f && ({ ...f, parking_amount: e.target.value }))} placeholder="0" />
                    </div>
                    <div>
                      <Label className="text-xs text-[#737686]">Permit (₹)</Label>
                      <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.permit_amount} onChange={e => setSheetEditForm(f => f && ({ ...f, permit_amount: e.target.value }))} placeholder="0" />
                    </div>
                  </div>

                  {/* Driver Adjustment */}
                  <div className="border-t border-[#FDE68A] pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#92400E]">Driver Adjustment <span className="font-normal normal-case text-[#B45309]">(used in driver settlement)</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-[#737686]">Opening KM</Label>
                        <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.driver_opening_km} onChange={e => setSheetEditForm(f => f && ({ ...f, driver_opening_km: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-xs text-[#737686]">Closing KM</Label>
                        <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.driver_closing_km} onChange={e => setSheetEditForm(f => f && ({ ...f, driver_closing_km: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-xs text-[#737686]">Opening Time</Label>
                        <Input type="time" className="h-8 text-sm mt-1" value={sheetEditForm.driver_opening_time} onChange={e => setSheetEditForm(f => f && ({ ...f, driver_opening_time: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs text-[#737686]">Closing Time</Label>
                        <Input type="time" className="h-8 text-sm mt-1" value={sheetEditForm.driver_closing_time} onChange={e => setSheetEditForm(f => f && ({ ...f, driver_closing_time: e.target.value }))} />
                      </div>
                    </div>
                    {(() => {
                      const driverRate = booking.trip_type === 'outstation'
                        ? (booking.driver?.bata_rate_outstation ?? booking.driver?.bata_rate ?? 300)
                        : (booking.driver?.bata_rate ?? 300)
                      const drv = sheetEditForm.bata_driver !== '' ? Number(sheetEditForm.bata_driver) : 0
                      if (drv === 0 || booking.trip_type === 'airport') return null
                      return (
                        <p className="text-xs text-[#92400E]">Bata: <span className="font-semibold">{drv} × ₹{driverRate} = ₹{drv * driverRate}</span></p>
                      )
                    })()}
                  </div>

                  {/* Client Adjustment */}
                  <div className="border-t border-[#FDE68A] pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E40AF]">Client Adjustment <span className="font-normal normal-case text-[#3B82F6]">(used in invoice)</span></p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-[#737686]">Opening KM</Label>
                        <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.client_opening_km} onChange={e => setSheetEditForm(f => f && ({ ...f, client_opening_km: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-xs text-[#737686]">Closing KM</Label>
                        <Input type="number" className="h-8 text-sm mt-1" value={sheetEditForm.client_closing_km} onChange={e => setSheetEditForm(f => f && ({ ...f, client_closing_km: e.target.value }))} placeholder="0" />
                      </div>
                      <div>
                        <Label className="text-xs text-[#737686]">Opening Time</Label>
                        <Input type="time" className="h-8 text-sm mt-1" value={sheetEditForm.client_opening_time} onChange={e => setSheetEditForm(f => f && ({ ...f, client_opening_time: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs text-[#737686]">Closing Time</Label>
                        <Input type="time" className="h-8 text-sm mt-1" value={sheetEditForm.client_closing_time} onChange={e => setSheetEditForm(f => f && ({ ...f, client_closing_time: e.target.value }))} />
                      </div>
                    </div>
                    {(() => {
                      const cli = sheetEditForm.bata_client !== '' ? Number(sheetEditForm.bata_client) : 0
                      if (cli === 0) return null
                      return (
                        <p className="text-xs text-[#1E40AF]">Client bata: <span className="font-semibold">{cli} bata billed</span></p>
                      )
                    })()}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="bg-[#1A56DB] hover:bg-[#003FB1] rounded-sm" onClick={handleSaveSheet} disabled={savingSheet}>
                      {savingSheet ? 'Saving…' : 'Save Changes'}
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-sm" onClick={() => { setEditingSheet(false); setSheetEditForm(null) }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {tripSheet && <div>
              {/* Three-tab layout: Actual | Driver | Client | GPS */}
              <div className="mb-3">
                <div className="flex gap-0.5 border-b border-[#E5E7EB] mb-3">
                  {(['actual', 'driver', 'client'] as const).map(tab => {
                    const hasAdj = tab === 'driver'
                      ? (tripSheet.driver_opening_km != null || tripSheet.driver_closing_km != null || tripSheet.driver_opening_time != null || tripSheet.driver_closing_time != null)
                      : tab === 'client'
                        ? (tripSheet.client_opening_km != null || tripSheet.client_closing_km != null || tripSheet.client_opening_time != null || tripSheet.client_closing_time != null)
                        : false
                    return (
                      <button
                        key={tab}
                        onClick={() => setSheetViewTab(tab)}
                        className={`px-3 py-1.5 text-xs font-semibold capitalize rounded-t-md border-b-2 -mb-px transition-colors flex items-center gap-1 ${
                          sheetViewTab === tab ? 'border-[#1A56DB] text-[#1A56DB] bg-[#EEF2FF]' : 'border-transparent text-[#737686] hover:text-[#434654]'
                        }`}
                      >
                        {tab === 'actual' ? 'Actual' : tab === 'driver' ? 'Driver' : 'Client'}
                        {hasAdj && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold">ADJ</span>}
                      </button>
                    )
                  })}
                </div>

                {/* TAB: Actual */}
                {sheetViewTab === 'actual' && (
                <div className="bg-[#F9F9FE] rounded-lg border border-[#C3C5D7] p-3 space-y-2 text-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#1A56DB] mb-1">Actual — Driver Entry</p>
                  <div className="flex justify-between items-center">
                    <span className="text-[#737686]">Opening KM</span>
                    <span className="font-medium text-[#191B23]">{tripSheet.opening_km != null ? tripSheet.opening_km.toLocaleString() : '—'}</span>
                  </div>
                  {tripSheet.manual_opening_time && <div className="flex justify-between"><span className="text-[#737686]">Opening Time</span><span className="text-[#434654]">{tripSheet.manual_opening_time}</span></div>}
                  <div className="flex justify-between items-center">
                    <span className="text-[#737686]">Closing KM</span>
                    <span className="font-medium text-[#191B23]">{tripSheet.closing_km != null ? tripSheet.closing_km.toLocaleString() : '—'}</span>
                  </div>
                  {tripSheet.manual_closing_time && <div className="flex justify-between"><span className="text-[#737686]">Closing Time</span><span className="text-[#434654]">{tripSheet.manual_closing_time}</span></div>}
                  {tripSheet.manual_opening_time && tripSheet.manual_closing_time && (
                    <div className="flex justify-between border-t border-[#C3C5D7] pt-1.5 mt-1">
                      <span className="text-[#737686]">Total Hours</span>
                      <span className="font-semibold text-[#191B23]">{calcManualDuration(tripSheet.manual_opening_time, tripSheet.manual_closing_time)}</span>
                    </div>
                  )}
                  {tripSheet.opening_km != null && tripSheet.closing_km != null && (
                    <div className="flex justify-between border-t border-[#C3C5D7] pt-1.5">
                      <span className="text-[#737686]">Total KM</span>
                      <span className="font-semibold text-[#191B23]">{(tripSheet.closing_km - tripSheet.opening_km).toFixed(1)} km</span>
                    </div>
                  )}
                  {(tripSheet.toll_amount != null || tripSheet.parking_amount != null || tripSheet.permit_amount != null) && (
                    <div className="border-t border-[#C3C5D7] pt-1.5 space-y-1.5">
                      {tripSheet.toll_amount != null && <div className="flex justify-between"><span className="text-[#737686]">Toll</span><span className="text-[#434654]">₹{tripSheet.toll_amount}</span></div>}
                      {tripSheet.parking_amount != null && <div className="flex justify-between"><span className="text-[#737686]">Parking</span><span className="text-[#434654]">₹{tripSheet.parking_amount}</span></div>}
                      {tripSheet.permit_amount != null && <div className="flex justify-between"><span className="text-[#737686]">Permit</span><span className="text-[#434654]">₹{tripSheet.permit_amount}</span></div>}
                    </div>
                  )}
                  {(() => {
                    const driverRate = booking.trip_type === 'outstation' ? (booking.driver?.bata_rate_outstation ?? booking.driver?.bata_rate ?? 300) : (booking.driver?.bata_rate ?? 300)
                    const isAirport = booking.trip_type === 'airport'
                    const drv = tripSheet.bata_driver ?? 0
                    const cli = tripSheet.bata_client ?? 0
                    if (drv === 0 && cli === 0) return null
                    return (
                      <div className="border-t border-[#C3C5D7] pt-1.5 space-y-1">
                        {!isAirport && drv > 0 && <div className="flex justify-between"><span className="text-[#737686]">Bata — Driver</span><span className="font-medium text-[#1A56DB]">{drv} × ₹{driverRate} = ₹{drv * driverRate}</span></div>}
                        {cli > 0 && <div className="flex justify-between"><span className="text-[#737686]">Bata — Client{isAirport ? ' only' : ''}</span><span className="font-medium text-[#0E9F6E]">{cli} bata billed</span></div>}
                      </div>
                    )
                  })()}
                </div>
                )}

                {/* TAB: Driver */}
                {sheetViewTab === 'driver' && (() => {
                  const dOKm = tripSheet.driver_opening_km ?? tripSheet.opening_km
                  const dCKm = tripSheet.driver_closing_km ?? tripSheet.closing_km
                  const dOTime = tripSheet.driver_opening_time ?? tripSheet.manual_opening_time
                  const dCTime = tripSheet.driver_closing_time ?? tripSheet.manual_closing_time
                  const isAdjKm = tripSheet.driver_opening_km != null || tripSheet.driver_closing_km != null
                  const isAdjTime = tripSheet.driver_opening_time != null || tripSheet.driver_closing_time != null
                  const driverRate = booking.trip_type === 'outstation' ? (booking.driver?.bata_rate_outstation ?? booking.driver?.bata_rate ?? 300) : (booking.driver?.bata_rate ?? 300)
                  const drv = tripSheet.bata_driver ?? 0
                  return (
                    <div className="bg-[#FFFBEB] rounded-lg border border-[#FDE68A] p-3 space-y-2 text-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#92400E] mb-1">Driver View — Settlement</p>
                      <div className="flex justify-between items-center">
                        <span className="text-[#737686]">Opening KM</span>
                        <span className={`font-medium ${isAdjKm ? 'text-amber-700' : 'text-[#191B23]'}`}>{dOKm != null ? dOKm.toLocaleString() : '—'}{isAdjKm && tripSheet.driver_opening_km != null ? ' ⚠' : ''}</span>
                      </div>
                      {dOTime && <div className="flex justify-between"><span className="text-[#737686]">Opening Time</span><span className={isAdjTime && tripSheet.driver_opening_time ? 'text-amber-700' : 'text-[#434654]'}>{dOTime}{isAdjTime && tripSheet.driver_opening_time ? ' ⚠' : ''}</span></div>}
                      <div className="flex justify-between items-center">
                        <span className="text-[#737686]">Closing KM</span>
                        <span className={`font-medium ${isAdjKm ? 'text-amber-700' : 'text-[#191B23]'}`}>{dCKm != null ? dCKm.toLocaleString() : '—'}{isAdjKm && tripSheet.driver_closing_km != null ? ' ⚠' : ''}</span>
                      </div>
                      {dCTime && <div className="flex justify-between"><span className="text-[#737686]">Closing Time</span><span className={isAdjTime && tripSheet.driver_closing_time ? 'text-amber-700' : 'text-[#434654]'}>{dCTime}{isAdjTime && tripSheet.driver_closing_time ? ' ⚠' : ''}</span></div>}
                      {dOTime && dCTime && <div className="flex justify-between border-t border-[#FDE68A] pt-1.5 mt-1"><span className="text-[#737686]">Total Hours</span><span className="font-semibold text-[#191B23]">{calcManualDuration(dOTime, dCTime)}</span></div>}
                      {dOKm != null && dCKm != null && <div className="flex justify-between border-t border-[#FDE68A] pt-1.5"><span className="text-[#737686]">Total KM</span><span className="font-semibold text-[#191B23]">{(dCKm - dOKm).toFixed(1)} km</span></div>}
                      {drv > 0 && booking.trip_type !== 'airport' && <div className="flex justify-between border-t border-[#FDE68A] pt-1.5"><span className="text-[#737686]">Bata</span><span className="font-medium text-[#1A56DB]">{drv} × ₹{driverRate} = ₹{drv * driverRate}</span></div>}
                    </div>
                  )
                })()}

                {/* TAB: Client */}
                {sheetViewTab === 'client' && (() => {
                  const cOKm = tripSheet.client_opening_km ?? tripSheet.opening_km
                  const cCKm = tripSheet.client_closing_km ?? tripSheet.closing_km
                  const cOTime = tripSheet.client_opening_time ?? tripSheet.manual_opening_time
                  const cCTime = tripSheet.client_closing_time ?? tripSheet.manual_closing_time
                  const isAdjKm = tripSheet.client_opening_km != null || tripSheet.client_closing_km != null
                  const isAdjTime = tripSheet.client_opening_time != null || tripSheet.client_closing_time != null
                  const cli = tripSheet.bata_client ?? 0
                  const isAirport = booking.trip_type === 'airport'
                  return (
                    <div className="bg-[#EFF6FF] rounded-lg border border-[#BFDBFE] p-3 space-y-2 text-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#1E40AF] mb-1">Client View — Invoice</p>
                      <div className="flex justify-between items-center">
                        <span className="text-[#737686]">Opening KM</span>
                        <span className={`font-medium ${isAdjKm ? 'text-blue-700' : 'text-[#191B23]'}`}>{cOKm != null ? cOKm.toLocaleString() : '—'}{isAdjKm && tripSheet.client_opening_km != null ? ' ⚠' : ''}</span>
                      </div>
                      {cOTime && <div className="flex justify-between"><span className="text-[#737686]">Opening Time</span><span className={isAdjTime && tripSheet.client_opening_time ? 'text-blue-700' : 'text-[#434654]'}>{cOTime}{isAdjTime && tripSheet.client_opening_time ? ' ⚠' : ''}</span></div>}
                      <div className="flex justify-between items-center">
                        <span className="text-[#737686]">Closing KM</span>
                        <span className={`font-medium ${isAdjKm ? 'text-blue-700' : 'text-[#191B23]'}`}>{cCKm != null ? cCKm.toLocaleString() : '—'}{isAdjKm && tripSheet.client_closing_km != null ? ' ⚠' : ''}</span>
                      </div>
                      {cCTime && <div className="flex justify-between"><span className="text-[#737686]">Closing Time</span><span className={isAdjTime && tripSheet.client_closing_time ? 'text-blue-700' : 'text-[#434654]'}>{cCTime}{isAdjTime && tripSheet.client_closing_time ? ' ⚠' : ''}</span></div>}
                      {cOTime && cCTime && <div className="flex justify-between border-t border-[#BFDBFE] pt-1.5 mt-1"><span className="text-[#737686]">Total Hours</span><span className="font-semibold text-[#191B23]">{calcManualDuration(cOTime, cCTime)}</span></div>}
                      {cOKm != null && cCKm != null && <div className="flex justify-between border-t border-[#BFDBFE] pt-1.5"><span className="text-[#737686]">Total KM</span><span className="font-semibold text-[#191B23]">{(cCKm - cOKm).toFixed(1)} km</span></div>}
                      {cli > 0 && <div className="flex justify-between border-t border-[#BFDBFE] pt-1.5"><span className="text-[#737686]">Bata{isAirport ? ' (client only)' : ''}</span><span className="font-medium text-[#0E9F6E]">{cli} bata billed</span></div>}
                    </div>
                  )
                })()}
              </div>

              {/* System / GPS */}
              <div className="bg-[#F0FDF4] rounded-lg border border-[#BBF7D0] p-3 space-y-2 text-sm mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#059669] mb-1">System / GPS</p>
                  {tripSheet.opening_time && (
                    <div className="flex justify-between items-center">
                      <span className="text-[#737686]">Arrived</span>
                      <span className="text-[#434654] text-xs">{new Date(tripSheet.opening_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                    </div>
                  )}
                  {tripSheet.closing_time && (
                    <div className="flex justify-between items-center">
                      <span className="text-[#737686]">Completed</span>
                      <span className="text-[#434654] text-xs">{new Date(tripSheet.closing_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                    </div>
                  )}
                  {tripSheet.opening_time && tripSheet.closing_time && (
                    <div className="flex justify-between border-t border-[#BBF7D0] pt-1.5">
                      <span className="text-[#737686]">{booking.trip_type === 'outstation' ? 'Duration' : 'Hours'}</span>
                      <span className="font-semibold text-[#059669]">{formatTripDuration(tripSheet.opening_time, tripSheet.closing_time, booking.trip_type)}</span>
                    </div>
                  )}
                  {tripSheet.gps_km != null && (
                    <div className="flex justify-between">
                      <span className="text-[#737686]">GPS KM</span>
                      <span className="text-[#434654]">{tripSheet.gps_km.toFixed(1)} km</span>
                    </div>
                  )}
                  {(tripSheet.office_to_pickup_km != null || tripSheet.drop_to_office_km != null) && (
                    <div className="border-t border-[#BBF7D0] pt-1.5 space-y-1.5">
                      {tripSheet.office_to_pickup_km != null && (
                        <div className="flex justify-between items-center">
                          <span className="text-[#737686]">Office→Pickup</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#434654]">{tripSheet.office_to_pickup_km} km</span>
                            {tripSheet.opening_lat != null && (
                              <a href={`https://www.google.com/maps?q=${tripSheet.opening_lat},${tripSheet.opening_lng}`} target="_blank" rel="noopener noreferrer" className="text-[#1A56DB]"><MapPin className="w-3 h-3" /></a>
                            )}
                          </div>
                        </div>
                      )}
                      {tripSheet.drop_to_office_km != null && (
                        <div className="flex justify-between items-center">
                          <span className="text-[#737686]">Drop→Office</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#434654]">{tripSheet.drop_to_office_km} km</span>
                            {tripSheet.closing_lat != null && (
                              <a href={`https://www.google.com/maps?q=${tripSheet.closing_lat},${tripSheet.closing_lng}`} target="_blank" rel="noopener noreferrer" className="text-[#1A56DB]"><MapPin className="w-3 h-3" /></a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {tripSheet.opening_km != null && tripSheet.closing_km != null && (tripSheet.office_to_pickup_km != null || tripSheet.drop_to_office_km != null) && (
                    <div className="flex justify-between border-t border-[#BBF7D0] pt-1.5">
                      <span className="font-medium text-[#191B23]">Grand Total</span>
                      <span className="font-semibold text-[#059669]">
                        {((tripSheet.closing_km - tripSheet.opening_km) + (tripSheet.office_to_pickup_km ?? 0) + (tripSheet.drop_to_office_km ?? 0)).toFixed(1)} km
                      </span>
                    </div>
                  )}
              </div>
              <div className="mt-3 pt-3 border-t border-[#C3C5D7]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[#737686]">Route Map</p>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/bookings/${booking.id}/regenerate-map`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sheet_id: tripSheet?.id }),
                          })
                          const json = await res.json()
                          if (!res.ok) { toast.error(json.error || 'Failed to generate map'); return }
                          toast.success('Map generated')
                          window.location.reload()
                        } catch { toast.error('Failed to generate map') }
                      }}
                      className="text-xs text-[#1A56DB] hover:underline"
                    >
                      {tripSheet.route_image_url ? 'Regenerate' : 'Generate Map'}
                    </button>
                  </div>
                  {tripSheet.route_image_url && (
                    <a href={tripSheet.route_image_url} target="_blank" rel="noopener noreferrer" title="Open full size">
                      <img
                        src={tripSheet.route_image_url}
                        alt="GPS route map"
                        className="w-full rounded-md border border-[#C3C5D7] cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </a>
                  )}
                  {!tripSheet.route_image_url && (
                    <p className="text-xs text-[#9CA3AF]">No map yet — click Generate Map above.</p>
                  )}
                </div>
              </div>}
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

      <Dialog open={showCopyMessage} onOpenChange={setShowCopyMessage}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy Message Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-sm">Template</Label>
                <Select
                  value={copyType}
                  onValueChange={v => {
                    if (!v) return
                    const t = v as typeof copyType
                    setCopyType(t)
                    void fetchCopyPreview(t, copyChannel)
                  }}
                >
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
                <Label className="mb-1.5 block text-sm">Format</Label>
                <Select
                  value={copyChannel}
                  onValueChange={v => {
                    if (!v) return
                    const c = v as typeof copyChannel
                    setCopyChannel(c)
                    void fetchCopyPreview(copyType, c)
                  }}
                >
                  <SelectTrigger className="border-[#C3C5D7]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp (plain text)</SelectItem>
                    <SelectItem value="email">Email (with subject)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block text-sm">Preview</Label>
              {copyLoading ? (
                <div className="h-40 flex items-center justify-center text-sm text-[#737686] border border-[#C3C5D7] rounded-md bg-[#F9FAFB]">
                  Generating…
                </div>
              ) : copyPreview ? (
                <div className="border border-[#C3C5D7] rounded-md bg-[#F9FAFB] p-3 text-xs font-mono text-[#191B23] whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {copyChannel === 'email' && (
                    <div className="text-[#737686] mb-2 pb-2 border-b border-[#E5E7EB]">
                      Subject: {copyPreview.subject}
                    </div>
                  )}
                  {copyPreview.body}
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-sm text-[#737686] border border-[#C3C5D7] rounded-md bg-[#F9FAFB]">
                  —
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCopyMessage(false)}>Close</Button>
            <Button
              disabled={!copyPreview || copyLoading}
              className={cn(
                'rounded-sm',
                copied ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-[#1A56DB] hover:bg-[#003FB1] text-white'
              )}
              onClick={handleCopyToClipboard}
            >
              {copied ? '✓ Copied!' : 'Copy to Clipboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {booking.booking_ref}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#434654]">
            This will permanently delete the booking and all associated data (tripsheet, legs, GPS logs, status history). <span className="font-semibold text-red-600">This cannot be undone.</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              {deleting ? 'Deleting…' : 'Delete Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
