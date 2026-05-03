import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import type { ConversationResult } from '@/lib/gemini/converse'
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

export async function handleClientChange(
  supabase: ReturnType<typeof createAdminClient>,
  client: Client,
  senderPhone: string,
  result: ConversationResult,
): Promise<string> {
  const isCancelRequest = result.intent === 'cancel_request'
  const modReq = result.modification_request

  // Find most recent active booking for this client (closest upcoming pickup first)
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, driver:drivers(name, phone, vehicle_name, vehicle_number)')
    .eq('client_id', client.id)
    .not('status', 'in', '("completed","cancelled")')
    .order('pickup_date', { ascending: true })
    .limit(1)
    .single()

  if (!booking) {
    return `I couldn't find any active booking for your account. Would you like to make a new booking?`
  }

  const hours = hoursUntilPickup(booking.pickup_date, booking.pickup_time)
  const hasDriver = !!booking.driver_id
  const driver = booking.driver as { name?: string; phone?: string } | null
  const isInProgress = booking.status === 'in_progress'
  const summary = pickupSummary(booking)

  // ── BLOCKED: driver already on the way ─────────────────────────────────────
  if (isInProgress || (hasDriver && hours < 2)) {
    await notifyOperator(
      [
        `🚨 URGENT — Client change request`,
        `Booking: ${booking.booking_ref}`,
        `Client: ${client.name} (${senderPhone})`,
        `Request: ${isCancelRequest ? 'CANCEL' : `MODIFY — ${FIELD_LABELS[modReq?.field ?? ''] ?? modReq?.field ?? '?'} → "${modReq?.new_value ?? '?'}"`}`,
        `Pickup: ${summary}`,
        hasDriver ? `Driver: ${driver?.name ?? 'assigned'} ${driver?.phone ? `— ${driver.phone}` : ''}` : '',
        isInProgress ? `Status: IN PROGRESS` : `Pickup in ${Math.round(hours * 10) / 10}h`,
      ].filter(Boolean).join('\n'),
      booking.id,
    )
    return `Your driver may already be on the way. Please call us immediately at 9845572207 to ${isCancelRequest ? 'cancel' : 'change'} your booking.`
  }

  // ── CANCELLATION ───────────────────────────────────────────────────────────
  if (isCancelRequest) {
    const reason = result.cancel_reason ?? 'Client requested via WhatsApp'

    if (!hasDriver) {
      // Safe to auto-cancel
      await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancelled_reason: reason, cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', booking.id)

      await supabase.from('booking_status_history').insert({
        booking_id: booking.id,
        old_status: booking.status,
        new_status: 'cancelled',
        changed_by: 'client (WhatsApp)',
        note: reason,
      })

      await supabase.from('booking_edit_logs').insert({
        booking_id: booking.id,
        changed_by: `${client.name} (WhatsApp)`,
        reason,
        changes: [{ field: 'status', label: 'Status', old_value: booking.status, new_value: 'cancelled' }],
      })

      await notifyOperator(
        [
          `ℹ️ Booking Cancelled by Client`,
          `Booking: ${booking.booking_ref}`,
          `Client: ${client.name} (${senderPhone})`,
          `Pickup: ${summary}`,
          `Reason: ${reason}`,
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

  // ── MODIFICATION ───────────────────────────────────────────────────────────
  if (!modReq?.field || !modReq?.new_value) {
    return result.next_question
      ?? `What would you like to change on your booking ${booking.booking_ref}? (e.g. pickup time, date, or location)`
  }

  const fieldLabel = FIELD_LABELS[modReq.field] ?? modReq.field
  const oldValue = String((booking as Record<string, unknown>)[modReq.field] ?? '—')
  const newValue = modReq.new_value
  const displayNew = fmtValue(modReq.field, newValue)

  if (!hasDriver) {
    // Safe to auto-apply
    const updateData: Record<string, unknown> = { [modReq.field]: newValue, updated_at: new Date().toISOString() }
    // pax_count must be a number
    if (modReq.field === 'pax_count') updateData.pax_count = parseInt(newValue) || null

    await supabase.from('bookings').update(updateData).eq('id', booking.id)

    await supabase.from('booking_edit_logs').insert({
      booking_id: booking.id,
      changed_by: `${client.name} (WhatsApp)`,
      reason: 'Client requested change via WhatsApp',
      changes: [{ field: modReq.field, label: fieldLabel, old_value: oldValue, new_value: newValue }],
    })

    await notifyOperator(
      [
        `ℹ️ Booking Modified by Client`,
        `Booking: ${booking.booking_ref}`,
        `Client: ${client.name} (${senderPhone})`,
        `Changed: ${fieldLabel}: ${fmtValue(modReq.field, oldValue)} → ${displayNew}`,
        `Pickup: ${summary}`,
        `No driver assigned.`,
      ].join('\n'),
      booking.id,
    )

    return [
      `Done! Your booking ${booking.booking_ref} has been updated.`,
      ``,
      `${fieldLabel}: ${displayNew}`,
      ``,
      `Our team will be in touch if there are any issues. Thank you!`,
    ].join('\n')
  }

  // Driver assigned — flag for operator review
  await supabase.from('booking_edit_logs').insert({
    booking_id: booking.id,
    changed_by: `${client.name} (WhatsApp) [PENDING]`,
    reason: 'Client requested change via WhatsApp — pending operator review',
    changes: [{ field: modReq.field, label: fieldLabel, old_value: oldValue, new_value: `${newValue} (requested, not yet applied)` }],
  })

  await notifyOperator(
    [
      `⚠️ MODIFY REQUEST — Review needed`,
      `Booking: ${booking.booking_ref}`,
      `Client: ${client.name} (${senderPhone})`,
      `Wants to change: ${fieldLabel} → ${displayNew}`,
      `Current value: ${fmtValue(modReq.field, oldValue)}`,
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
