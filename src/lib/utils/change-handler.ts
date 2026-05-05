import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import type { ConversationResult, ModificationRequest } from '@/lib/gemini/converse'
import type { Client } from '@/types'

const FIELD_LABELS: Record<string, string> = {
  pickup_time: 'Pickup time',
  pickup_date: 'Pickup date',
  pickup_location: 'Pickup location',
  drop_location: 'Drop location',
  pax_count: 'Passengers',
  vehicle_type: 'Vehicle type',
  special_instructions: 'Special instructions',
}

export interface PendingAction {
  intent: 'cancel_request' | 'modify_request'
  modification_request: ModificationRequest | null
  cancel_reason: string | null
  bookings: Array<{
    id: string
    booking_ref: string
    guest_name: string | null
    pickup_date: string | null
    pickup_time: string | null
    pickup_location: string | null
    drop_location: string | null
    trip_type: string | null
    total_days: number | null
    driver_id: string | null
    status: string
  }>
}

function hoursUntilPickup(pickupDate: string | null, pickupTime: string | null): number {
  if (!pickupDate || !pickupTime) return Infinity
  const pickup = new Date(`${pickupDate}T${pickupTime}:00+05:30`)
  return (pickup.getTime() - Date.now()) / (1000 * 60 * 60)
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
}

function fmtTime(timeStr: string | null): string {
  if (!timeStr) return ''
  const [hh, mm] = timeStr.split(':').map(Number)
  const ampm = hh >= 12 ? 'PM' : 'AM'
  return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`
}

function fmtValue(field: string, raw: string): string {
  if (field === 'pickup_time') return fmtTime(raw)
  if (field === 'pickup_date') return fmtDate(raw)
  return raw
}

function pickupSummary(b: { pickup_date?: string | null; pickup_time?: string | null; pickup_location?: string | null }): string {
  const parts: string[] = []
  if (b.pickup_date) parts.push(fmtDate(b.pickup_date))
  if (b.pickup_time) parts.push(fmtTime(b.pickup_time))
  if (b.pickup_location) parts.push(`from ${b.pickup_location}`)
  return parts.join(', ')
}

async function notifyOperator(message: string, bookingId?: string): Promise<void> {
  const phone = process.env.OPERATOR_WHATSAPP_NUMBER
  if (!phone) return
  const link = bookingId ? `\n\nView: ${process.env.NEXT_PUBLIC_APP_URL}/bookings/${bookingId}` : ''
  await sendWhatsAppMessage({ to: phone, body: message + link }).catch(() => {})
}

// ── Shared action helpers ──────────────────────────────────────────────────────

type FullBooking = {
  id: string
  booking_ref: string
  status: string
  pickup_date: string | null
  pickup_time: string | null
  pickup_location: string | null
  driver_id: string | null
  driver?: { name?: string; phone?: string } | null
  [key: string]: unknown
}

async function performCancel(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  senderPhone: string,
  booking: FullBooking,
  reason: string | null,
): Promise<string> {
  const cancelReason = reason ?? 'Client requested via WhatsApp'
  const hasDriver = !!booking.driver_id
  const driver = booking.driver as { name?: string; phone?: string } | null
  const summary = pickupSummary(booking)

  if (!hasDriver) {
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancelled_reason: cancelReason, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', booking.id)

    await supabase.from('booking_status_history').insert({
      booking_id: booking.id,
      old_status: booking.status,
      new_status: 'cancelled',
      changed_by: 'client (WhatsApp)',
      note: cancelReason,
    })

    await supabase.from('booking_edit_logs').insert({
      booking_id: booking.id,
      changed_by: `${client.name} (WhatsApp)`,
      reason: cancelReason,
      changes: [{ field: 'status', label: 'Status', old_value: booking.status, new_value: 'cancelled' }],
    })

    await notifyOperator(
      [
        `ℹ️ Booking Cancelled by Client`,
        `Booking: ${booking.booking_ref}`,
        `Client: ${client.name} (${senderPhone})`,
        `Pickup: ${summary}`,
        `Reason: ${cancelReason}`,
        `No driver was assigned.`,
      ].join('\n'),
      booking.id,
    )

    return [
      `Your booking ${booking.booking_ref}${booking.pickup_date ? ` for ${fmtDate(booking.pickup_date)}` : ''} has been cancelled.`,
      ``,
      `Let us know if you need a new cab — just message us here.`,
    ].join('\n')
  }

  // Driver assigned — cannot auto-cancel
  await notifyOperator(
    [
      `⚠️ CANCEL REQUEST — Action needed`,
      `Booking: ${booking.booking_ref}`,
      `Client: ${client.name} (${senderPhone})`,
      `Pickup: ${summary}`,
      `Driver: ${driver?.name ?? 'assigned'} ${driver?.phone ? `— ${driver.phone}` : ''}`,
      `Please inform the driver and confirm cancellation.`,
    ].join('\n'),
    booking.id,
  )

  return [
    `Your cancellation request for ${booking.booking_ref} has been sent to our team.`,
    ``,
    `Since a driver has been assigned, please also call us at 9845572207 so we can inform the driver immediately.`,
  ].join('\n')
}

async function performModify(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  senderPhone: string,
  booking: FullBooking,
  modReq: ModificationRequest | null,
  fallbackQuestion: string | null,
): Promise<string> {
  if (!modReq?.changes?.length) {
    return fallbackQuestion
      ?? `What would you like to change on your booking ${booking.booking_ref}? (e.g. pickup time, date, or location)`
  }

  const hasDriver = !!booking.driver_id
  const driver = booking.driver as { name?: string; phone?: string } | null
  const summary = pickupSummary(booking)

  // Build update payload and change log entries for all requested changes
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changeEntries: Array<{ field: string; label: string; old_value: string; new_value: string }> = []

  for (const change of modReq.changes) {
    const label = FIELD_LABELS[change.field] ?? change.field
    const oldVal = String((booking as Record<string, unknown>)[change.field] ?? '—')
    updateData[change.field] = change.field === 'pax_count' ? (parseInt(change.new_value) || null) : change.new_value
    changeEntries.push({ field: change.field, label, old_value: oldVal, new_value: change.new_value })
  }

  const changesSummary = changeEntries
    .map(c => `${c.label}: ${fmtValue(c.field, c.new_value)}`)
    .join('\n')

  if (!hasDriver) {
    await supabase.from('bookings').update(updateData).eq('id', booking.id)

    await supabase.from('booking_edit_logs').insert({
      booking_id: booking.id,
      changed_by: `${client.name} (WhatsApp)`,
      reason: 'Client requested change via WhatsApp',
      changes: changeEntries,
    })

    await notifyOperator(
      [
        `ℹ️ Booking Modified by Client`,
        `Booking: ${booking.booking_ref}`,
        `Client: ${client.name} (${senderPhone})`,
        ...changeEntries.map(c => `Changed: ${c.label}: ${fmtValue(c.field, c.old_value)} → ${fmtValue(c.field, c.new_value)}`),
        `Pickup: ${summary}`,
        `No driver assigned.`,
      ].join('\n'),
      booking.id,
    )

    return [
      `Done! Your booking ${booking.booking_ref} has been updated.`,
      ``,
      changesSummary,
      ``,
      `Our team will be in touch if there are any issues. Thank you!`,
    ].join('\n')
  }

  // Driver assigned — flag all changes for operator review
  const pendingEntries = changeEntries.map(c => ({
    ...c,
    new_value: `${c.new_value} (requested, not yet applied)`,
  }))

  await supabase.from('booking_edit_logs').insert({
    booking_id: booking.id,
    changed_by: `${client.name} (WhatsApp) [PENDING]`,
    reason: 'Client requested change via WhatsApp — pending operator review',
    changes: pendingEntries,
  })

  await notifyOperator(
    [
      `⚠️ MODIFY REQUEST — Review needed`,
      `Booking: ${booking.booking_ref}`,
      `Client: ${client.name} (${senderPhone})`,
      ...changeEntries.map(c => `Wants to change: ${c.label}: ${fmtValue(c.field, c.old_value)} → ${fmtValue(c.field, c.new_value)}`),
      `Pickup: ${summary}`,
      `Driver: ${driver?.name ?? 'assigned'} ${driver?.phone ? `— ${driver.phone}` : ''}`,
      `Please update booking and inform driver if needed.`,
    ].join('\n'),
    booking.id,
  )

  return [
    `Your change request for ${booking.booking_ref} has been sent to our team.`,
    ``,
    `Since a driver has been assigned, our team will review and confirm the change. You can also call us at 9845572207 for an immediate response.`,
  ].join('\n')
}

// ── Disambiguation list builder ────────────────────────────────────────────────

function buildBookingList(bookings: PendingAction['bookings']): string {
  return bookings.map((b, i) => {
    const date = b.pickup_date ? fmtDate(b.pickup_date) : '?'
    const time = b.pickup_time ? `, ${fmtTime(b.pickup_time)}` : ''
    const guest = b.guest_name ? ` — Guest: ${b.guest_name}` : ''
    let tripDesc = ''
    if (b.trip_type === 'outstation' && b.drop_location) {
      tripDesc = ` — Outstation to ${b.drop_location}${b.total_days && b.total_days > 1 ? `, ${b.total_days} days` : ''}`
    } else if (b.trip_type === 'airport') {
      tripDesc = ` — Airport`
    } else if (b.trip_type === 'local' && (b.total_days ?? 1) > 1) {
      tripDesc = ` — Local, ${b.total_days} days`
    }
    return `${i + 1}. ${b.booking_ref} — ${date}${time}${guest}${tripDesc}`
  }).join('\n')
}

// ── Main exports ───────────────────────────────────────────────────────────────

export async function handleClientChange(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  senderPhone: string,
  result: ConversationResult,
): Promise<{ reply: string; pendingAction: PendingAction | null }> {
  const isCancelRequest = result.intent === 'cancel_request'
  const modReq = result.modification_request

  const { data: allBookings } = await supabase
    .from('bookings')
    .select('*, driver:drivers(name, phone, vehicle_name, vehicle_number)')
    .eq('client_id', client.id)
    .not('status', 'in', '("completed","cancelled")')
    .order('pickup_date', { ascending: true })
    .order('pickup_time', { ascending: true })

  if (!allBookings?.length) {
    return { reply: `I couldn't find any active booking for your account. Would you like to make a new booking?`, pendingAction: null }
  }

  // Try to narrow down to a single booking using identifiers Gemini extracted
  let booking: FullBooking | null = null

  if (allBookings.length === 1) {
    booking = allBookings[0] as FullBooking
  } else {
    const targetRef = result.target_booking_ref ?? modReq?.booking_ref
    const guestName = result.extracted.guest_name

    if (targetRef) {
      const match = allBookings.find(b =>
        b.booking_ref.toLowerCase() === targetRef.toLowerCase()
      )
      if (match) booking = match as FullBooking
    }

    if (!booking && guestName) {
      const lower = guestName.toLowerCase()
      const matches = allBookings.filter(b =>
        b.guest_name?.toLowerCase().includes(lower)
      )
      if (matches.length === 1) booking = matches[0] as FullBooking
    }
  }

  // Still ambiguous — ask client to choose
  if (!booking) {
    const list = buildBookingList(
      allBookings.slice(0, 5).map(b => ({
        id: b.id,
        booking_ref: b.booking_ref,
        guest_name: b.guest_name ?? null,
        pickup_date: b.pickup_date ?? null,
        pickup_time: b.pickup_time ?? null,
        pickup_location: b.pickup_location ?? null,
        drop_location: b.drop_location ?? null,
        trip_type: b.trip_type ?? null,
        total_days: b.total_days ?? null,
        driver_id: b.driver_id ?? null,
        status: b.status,
      }))
    )
    const action = isCancelRequest ? 'cancel' : 'change'
    const reply = [
      `You have multiple active bookings. Which one would you like to ${action}?`,
      ``,
      list,
      ``,
      `Reply with the number (1, 2, 3) or booking reference (e.g. ${allBookings[0].booking_ref}).`,
    ].join('\n')

    const pendingAction: PendingAction = {
      intent: result.intent as 'cancel_request' | 'modify_request',
      modification_request: modReq,
      cancel_reason: result.cancel_reason,
      bookings: allBookings.slice(0, 5).map(b => ({
        id: b.id,
        booking_ref: b.booking_ref,
        guest_name: b.guest_name ?? null,
        pickup_date: b.pickup_date ?? null,
        pickup_time: b.pickup_time ?? null,
        pickup_location: b.pickup_location ?? null,
        drop_location: b.drop_location ?? null,
        trip_type: b.trip_type ?? null,
        total_days: b.total_days ?? null,
        driver_id: b.driver_id ?? null,
        status: b.status,
      })),
    }

    return { reply, pendingAction }
  }

  // Single booking identified — check timing/status constraints
  const hours = hoursUntilPickup(booking.pickup_date as string, booking.pickup_time as string)
  const hasDriver = !!booking.driver_id
  const isInProgress = booking.status === 'in_progress'
  const summary = pickupSummary(booking)

  if (isInProgress || (hasDriver && hours < 2)) {
    await notifyOperator(
      [
        `🚨 URGENT — Client change request`,
        `Booking: ${booking.booking_ref}`,
        `Client: ${client.name} (${senderPhone})`,
        `Request: ${isCancelRequest ? 'CANCEL' : `MODIFY — ${modReq?.changes?.map(c => `${FIELD_LABELS[c.field] ?? c.field} → "${c.new_value}"`).join(', ') ?? '?'}`}`,
        `Pickup: ${summary}`,
        hasDriver ? `Driver: ${(booking.driver as { name?: string; phone?: string } | null)?.name ?? 'assigned'}` : '',
        isInProgress ? `Status: IN PROGRESS` : `Pickup in ${Math.round(hours * 10) / 10}h`,
      ].filter(Boolean).join('\n'),
      booking.id,
    )
    return {
      reply: `Your driver may already be on the way. Please call us immediately at 9845572207 to ${isCancelRequest ? 'cancel' : 'change'} your booking.`,
      pendingAction: null,
    }
  }

  if (isCancelRequest) {
    const reply = await performCancel(supabase, client, senderPhone, booking, result.cancel_reason)
    return { reply, pendingAction: null }
  }

  const reply = await performModify(supabase, client, senderPhone, booking, modReq, result.next_question)
  return { reply, pendingAction: null }
}

export async function handleDisambiguationReply(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  senderPhone: string,
  rawText: string,
  pendingAction: PendingAction,
): Promise<{ reply: string; resolved: boolean }> {
  const text = rawText.toLowerCase().trim()
  const { bookings } = pendingAction

  let booking: PendingAction['bookings'][0] | null = null

  // 1. Number index (1–5)
  const numMatch = text.match(/\b([1-5])\b/)
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1
    if (idx >= 0 && idx < bookings.length) booking = bookings[idx]
  }

  // 2. Word ordinals
  if (!booking) {
    const words = ['first', 'second', 'third', 'fourth', 'fifth']
    const idx = words.findIndex(w => text.includes(w))
    if (idx !== -1 && idx < bookings.length) booking = bookings[idx]
  }

  // 3. Booking ref (BK-XXXX or BK XXXX)
  if (!booking) {
    const refMatch = text.match(/bk[\s-]?(\d+)/i)
    if (refMatch) {
      const found = bookings.find(b =>
        b.booking_ref.replace('-', '').toLowerCase() === `bk${refMatch[1]}`.toLowerCase()
      )
      if (found) booking = found
    }
  }

  // 4. Guest name — match first word of the name the client typed
  if (!booking) {
    const found = bookings.find(b =>
      b.guest_name &&
      b.guest_name.toLowerCase().split(' ').some(part => part.length > 2 && text.includes(part))
    )
    if (found) booking = found
  }

  // 5. Drop location / destination (e.g. "the Mysore trip", "Coorg booking")
  if (!booking) {
    const found = bookings.find(b =>
      b.drop_location &&
      b.drop_location.toLowerCase().split(/[\s,]+/).some(part => part.length > 2 && text.includes(part))
    )
    if (found) booking = found
  }

  // 6. Trip type keyword (e.g. "airport", "outstation", "local")
  if (!booking) {
    const tripKeywords: Record<string, string> = { airport: 'airport', outstation: 'outstation', local: 'local' }
    for (const [keyword, type] of Object.entries(tripKeywords)) {
      if (text.includes(keyword)) {
        const matches = bookings.filter(b => b.trip_type === type)
        if (matches.length === 1) { booking = matches[0]; break }
      }
    }
  }

  // 7. Time match (e.g. "9 am", "2 pm", "14:00")
  if (!booking) {
    const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i)
    if (timeMatch) {
      let h = parseInt(timeMatch[1])
      const m = timeMatch[2] ? parseInt(timeMatch[2]) : 0
      const meridiem = timeMatch[3].toLowerCase()
      if (meridiem === 'pm' && h < 12) h += 12
      if (meridiem === 'am' && h === 12) h = 0
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      const found = bookings.find(b => b.pickup_time?.startsWith(timeStr))
      if (found) booking = found
    }
  }

  if (!booking) {
    const list = buildBookingList(bookings)
    return {
      reply: `I couldn't identify which booking. Please reply with the number or reference:\n\n${list}`,
      resolved: false,
    }
  }

  // Re-fetch with driver info for accurate timing/status
  const { data: fullBooking } = await supabase
    .from('bookings')
    .select('*, driver:drivers(name, phone, vehicle_name, vehicle_number)')
    .eq('id', booking.id)
    .single()

  if (!fullBooking) {
    return { reply: `That booking could not be found. Please call us at 9845572207.`, resolved: true }
  }

  const fb = fullBooking as FullBooking
  const hours = hoursUntilPickup(fb.pickup_date as string, fb.pickup_time as string)
  const hasDriver = !!fb.driver_id
  const isInProgress = fb.status === 'in_progress'
  const isCancelRequest = pendingAction.intent === 'cancel_request'
  const summary = pickupSummary(fb)

  if (isInProgress || (hasDriver && hours < 2)) {
    await notifyOperator(
      [
        `🚨 URGENT — Client change request`,
        `Booking: ${fb.booking_ref}`,
        `Client: ${client.name} (${senderPhone})`,
        `Request: ${isCancelRequest ? 'CANCEL' : 'MODIFY'}`,
        `Pickup: ${summary}`,
        isInProgress ? `Status: IN PROGRESS` : `Pickup in ${Math.round(hours * 10) / 10}h`,
      ].join('\n'),
      fb.id,
    )
    return {
      reply: `Your driver may already be on the way. Please call us immediately at 9845572207 to ${isCancelRequest ? 'cancel' : 'change'} your booking.`,
      resolved: true,
    }
  }

  if (isCancelRequest) {
    const reply = await performCancel(supabase, client, senderPhone, fb, pendingAction.cancel_reason)
    return { reply, resolved: true }
  }

  const reply = await performModify(supabase, client, senderPhone, fb, pendingAction.modification_request, null)
  return { reply, resolved: true }
}
