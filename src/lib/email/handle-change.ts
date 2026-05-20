import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/gmail/send'
import { notifyOperator as globalNotifyOperator } from '@/lib/utils/notify-operator'
import { formatDate, formatTime } from '@/lib/utils/date'
import type { EmailModificationChange } from '@/lib/gemini/classify-and-extract'

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


function fmtValue(field: string, raw: string): string {
  if (!raw || raw === '—') return raw || '—'
  if (field === 'pickup_time') {
    return /^\d{1,2}:\d{2}$/.test(raw) ? formatTime(raw) : raw
  }
  if (field === 'pickup_date') {
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? formatDate(raw) : raw
  }
  return raw
}

async function notify(message: string, bookingId?: string): Promise<void> {
  const link = bookingId ? `\n\nView: ${process.env.NEXT_PUBLIC_APP_URL}/bookings/${bookingId}` : ''
  await globalNotifyOperator(message + link, 'ops').catch(() => {})
}

type Threading = { replyToThreadId?: string; inReplyToMessageId?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingRow = Record<string, any>

export async function handleEmailCancel(
  supabase: ReturnType<typeof createAdminClient>,
  booking: BookingRow,
  clientName: string,
  senderEmail: string,
  ccEmails: string[] | undefined,
  cancelReason: string | null,
  threading: Threading,
): Promise<void> {
  const reason = cancelReason || 'Client requested via email'
  const hasDriver = !!booking.driver_id
  const driver = booking.driver as { name?: string; phone?: string } | null
  const hours = hoursUntilPickup(booking.pickup_date, booking.pickup_time)

  const cc = ccEmails && ccEmails.length > 0 ? ccEmails : undefined
  const subj = `Booking Cancellation - ${booking.booking_ref}`

  // Mark raw message as linked to this booking (caller sets booking_id on raw_message)

  if (booking.status === 'in_progress' || (hasDriver && hours < 2)) {
    await notify(
      `🚨 URGENT cancel request via email\nBooking: ${booking.booking_ref}\nFrom: ${senderEmail}\nPickup in ~${Math.round(hours)}h\nDriver: ${driver?.name ?? 'assigned'}`,
      booking.id,
    )
    await sendEmail({
      to: senderEmail, subject: `Re: ${subj}`, cc, ...threading,
      body: [
        `Hi ${clientName},`,
        ``,
        `Your driver may already be on the way for booking ${booking.booking_ref}.`,
        `Please call us immediately at 9845572207 to process your cancellation.`,
        ``,
        `JMS Travels Team`,
      ].join('\n'),
    }).catch(() => {})
    return
  }

  if (hasDriver) {
    await notify(
      `⚠️ CANCEL REQUEST (driver assigned) via email\nBooking: ${booking.booking_ref}\nFrom: ${senderEmail}\nDriver: ${driver?.name ?? 'assigned'}`,
      booking.id,
    )
    await sendEmail({
      to: senderEmail, subject: `Re: ${subj}`, cc, ...threading,
      body: [
        `Hi ${clientName},`,
        ``,
        `Your cancellation request for booking ${booking.booking_ref} has been sent to our team.`,
        `Since a driver has been assigned, please also call us at 9845572207 so we can notify the driver promptly.`,
        ``,
        `JMS Travels Team`,
      ].join('\n'),
    }).catch(() => {})
    return
  }

  // No driver — cancel directly
  await supabase.from('bookings').update({
    status: 'cancelled',
    cancelled_reason: reason,
    cancelled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', booking.id)

  await supabase.from('booking_status_history').insert({
    booking_id: booking.id,
    old_status: booking.status,
    new_status: 'cancelled',
    changed_by: `${clientName} (email)`,
    note: reason,
  })

  await supabase.from('booking_edit_logs').insert({
    booking_id: booking.id,
    changed_by: `${clientName} (email)`,
    reason,
    changes: [{ field: 'status', label: 'Status', old_value: booking.status, new_value: 'cancelled' }],
  })

  const dateLine = [
    booking.pickup_date ? formatDate(booking.pickup_date) : null,
    booking.pickup_time ? `at ${formatTime(booking.pickup_time)}` : null,
    booking.pickup_location ? `from ${booking.pickup_location}` : null,
  ].filter(Boolean).join(', ')

  await notify(
    [
      `ℹ️ Booking Cancelled by Client (email)`,
      `Booking: ${booking.booking_ref}`,
      `From: ${senderEmail}`,
      dateLine ? `Pickup: ${dateLine}` : null,
      `Reason: ${reason}`,
    ].filter(Boolean).join('\n'),
    booking.id,
  )

  await sendEmail({
    to: senderEmail,
    subject: `Booking Cancelled - ${booking.booking_ref}`,
    cc, ...threading,
    body: [
      `Hi ${clientName},`,
      ``,
      `Your booking ${booking.booking_ref} has been cancelled as requested.`,
      dateLine ? `\nBooking was for: ${dateLine}` : '',
      ``,
      `Let us know if you need to arrange a new trip.`,
      ``,
      `JMS Travels Team`,
    ].filter(l => l !== '').join('\n'),
  }).catch(() => {})
}

export async function handleEmailModify(
  supabase: ReturnType<typeof createAdminClient>,
  booking: BookingRow,
  clientName: string,
  senderEmail: string,
  ccEmails: string[] | undefined,
  modReq: { changes: EmailModificationChange[]; booking_ref: string | null } | null,
  threading: Threading,
  today: string,
): Promise<void> {
  const cc = ccEmails && ccEmails.length > 0 ? ccEmails : undefined
  const subj = `Booking Modification - ${booking.booking_ref}`

  if (!modReq?.changes?.length) {
    await notify(`ℹ️ Vague modify request via email\nBooking: ${booking.booking_ref}\nFrom: ${senderEmail}`, booking.id)
    await sendEmail({
      to: senderEmail, subject: `Re: ${subj}`, cc, ...threading,
      body: [
        `Hi ${clientName},`,
        ``,
        `We received your request to modify booking ${booking.booking_ref}.`,
        `Could you let us know what you'd like to change — the date, time, or pickup location?`,
        ``,
        `JMS Travels Team`,
      ].join('\n'),
    }).catch(() => {})
    return
  }

  const hasDriver = !!booking.driver_id
  const driver = booking.driver as { name?: string; phone?: string } | null
  const hours = hoursUntilPickup(booking.pickup_date, booking.pickup_time)

  // Validate date changes — reject past dates
  for (const change of modReq.changes) {
    if (change.field === 'pickup_date' && change.new_value < today) {
      await sendEmail({
        to: senderEmail, subject: `Re: ${subj}`, cc, ...threading,
        body: [
          `Hi ${clientName},`,
          ``,
          `The date ${formatDate(change.new_value)} is in the past. Please provide a future date for booking ${booking.booking_ref}.`,
          ``,
          `JMS Travels Team`,
        ].join('\n'),
      }).catch(() => {})
      return
    }
  }

  if (booking.status === 'in_progress' || (hasDriver && hours < 2)) {
    await notify(`🚨 URGENT modify request via email\nBooking: ${booking.booking_ref}\nFrom: ${senderEmail}`, booking.id)
    await sendEmail({
      to: senderEmail, subject: `Re: ${subj}`, cc, ...threading,
      body: [
        `Hi ${clientName},`,
        ``,
        `Your driver may already be on the way for booking ${booking.booking_ref}.`,
        `Please call us immediately at 9845572207 to request changes.`,
        ``,
        `JMS Travels Team`,
      ].join('\n'),
    }).catch(() => {})
    return
  }

  const changeEntries: Array<{ field: string; label: string; old_value: string; new_value: string }> = []
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const change of modReq.changes) {
    const label = FIELD_LABELS[change.field] ?? change.field
    const oldVal = String((booking as Record<string, unknown>)[change.field] ?? '—')
    updateData[change.field] = change.field === 'pax_count' ? (parseInt(change.new_value) || null) : change.new_value
    changeEntries.push({ field: change.field, label, old_value: oldVal, new_value: change.new_value })
  }

  // Clear flags that are resolved by this modification
  const changedFields = new Set(modReq.changes.map(c => c.field))
  const currentFlags: string[] = (booking.flags as string[]) ?? []
  const updatedFlags = currentFlags.filter(f => {
    if (f === 'missing_pickup' && changedFields.has('pickup_location')) return false
    if (f === 'missing_date'   && changedFields.has('pickup_date'))     return false
    if (f === 'missing_time'   && changedFields.has('pickup_time'))     return false
    return true
  })
  updateData.flags = updatedFlags

  const changesSummary = changeEntries
    .map(c => `${c.label}: ${fmtValue(c.field, c.old_value)} → ${fmtValue(c.field, c.new_value)}`)
    .join('\n')

  if (!hasDriver) {
    await supabase.from('bookings').update(updateData).eq('id', booking.id)

    await supabase.from('booking_edit_logs').insert({
      booking_id: booking.id,
      changed_by: `${clientName} (email)`,
      reason: 'Client requested change via email',
      changes: changeEntries,
    })

    await notify(
      [
        `ℹ️ Booking Modified by Client (email)`,
        `Booking: ${booking.booking_ref}`,
        `From: ${senderEmail}`,
        ...changeEntries.map(c => `Changed: ${c.label}: ${fmtValue(c.field, c.old_value)} → ${fmtValue(c.field, c.new_value)}`),
      ].join('\n'),
      booking.id,
    )

    await sendEmail({
      to: senderEmail,
      subject: `Booking Updated - ${booking.booking_ref}`,
      cc, ...threading,
      body: [
        `Hi ${clientName},`,
        ``,
        `Your booking ${booking.booking_ref} has been updated:`,
        ``,
        changesSummary,
        ``,
        `Our team will be in touch if there are any issues. Thank you for choosing JMS Travels.`,
      ].join('\n'),
    }).catch(() => {})
    return
  }

  // Driver assigned — log as pending, ask operator to review
  const pendingEntries = changeEntries.map(c => ({
    ...c, new_value: `${c.new_value} (requested, not yet applied)`,
  }))

  await supabase.from('booking_edit_logs').insert({
    booking_id: booking.id,
    changed_by: `${clientName} (email) [PENDING]`,
    reason: 'Client requested change via email — pending operator review',
    changes: pendingEntries,
  })

  await notify(
    [
      `⚠️ MODIFY REQUEST — Review needed (email)`,
      `Booking: ${booking.booking_ref}`,
      `From: ${senderEmail}`,
      ...changeEntries.map(c => `Wants: ${c.label}: ${fmtValue(c.field, c.old_value)} → ${fmtValue(c.field, c.new_value)}`),
      `Driver: ${driver?.name ?? 'assigned'}`,
    ].join('\n'),
    booking.id,
  )

  await sendEmail({
    to: senderEmail, subject: `Re: ${subj}`, cc, ...threading,
    body: [
      `Hi ${clientName},`,
      ``,
      `Your change request for booking ${booking.booking_ref} has been sent to our team.`,
      `Since a driver has been assigned, our team will review and confirm the change.`,
      `You can also call us at 9845572207 for an immediate response.`,
      ``,
      `JMS Travels Team`,
    ].join('\n'),
  }).catch(() => {})
}
