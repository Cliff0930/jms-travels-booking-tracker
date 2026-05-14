import { createAdminClient } from '@/lib/supabase/server'
import { extractBookingFields } from '@/lib/gemini/extract'
import { sendEmail } from '@/lib/gmail/send'

function getTodayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
}

export async function fillMissingFromReply(
  supabase: ReturnType<typeof createAdminClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: Record<string, any>,
  replyContent: string,
  senderEmail: string,
  ccEmails: string[],
  threadId: string,
  originalMessageId?: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = booking.client as Record<string, any> | null
  const savedLocations = client?.locations || []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraction = await extractBookingFields(replyContent, client as any, savedLocations)
  const newFields = extraction.bookings[0]?.extracted ?? {}

  const today = getTodayIST()
  let mergedDate = (booking.pickup_date as string | null) || newFields.pickup_date || null
  if (mergedDate && mergedDate < today) mergedDate = null

  const merged = {
    pickup_location: booking.pickup_location || newFields.pickup_location || null,
    drop_location:   booking.drop_location   || newFields.drop_location   || null,
    pickup_date:     mergedDate,
    pickup_time:     booking.pickup_time     || newFields.pickup_time     || null,
    pax_count:       booking.pax_count       ?? newFields.pax_count       ?? null,
    vehicle_type:    booking.vehicle_type    || newFields.vehicle_type    || null,
    guest_name:      booking.guest_name      || newFields.guest_name      || null,
    guest_phone:     booking.guest_phone     || newFields.guest_phone     || null,
    special_instructions: booking.special_instructions || newFields.special_instructions || null,
  }

  const stillMissing: string[] = []
  if (!merged.pickup_location) stillMissing.push('pickup_location')
  if (!merged.pickup_date)     stillMissing.push('pickup_date')
  if (!merged.pickup_time)     stillMissing.push('pickup_time')

  // Update flags — remove ones that are now satisfied
  const flags: string[] = (booking.flags as string[]) ?? []
  const updatedFlags = flags.filter(f => {
    if (f === 'missing_pickup' && merged.pickup_location) return false
    if (f === 'missing_date'   && merged.pickup_date)     return false
    if (f === 'missing_time'   && merged.pickup_time)     return false
    return true
  })

  await supabase.from('bookings').update({
    ...merged,
    flags: updatedFlags,
    gmail_thread_id: threadId,
  }).eq('id', booking.id)

  await supabase.from('booking_status_history').insert({
    booking_id: booking.id,
    old_status: booking.status,
    new_status: booking.status,
    changed_by: senderEmail,
    note: stillMissing.length > 0 ? `Missing info received via email reply — still waiting for: ${stillMissing.join(', ')}` : 'All missing fields received via email reply',
  })

  const clientName = (client?.name as string | undefined) || senderEmail.split('@')[0]
  const bookingRef = booking.booking_ref as string
  const emailCc = ccEmails.length > 0 ? ccEmails : undefined
  const threading = { replyToThreadId: threadId, inReplyToMessageId: originalMessageId }

  if (stillMissing.length > 0) {
    const missingList = stillMissing.map(f => f.replace(/_/g, ' ')).join(', ')
    const body = [
      `Hi ${clientName},`,
      ``,
      `Thank you for getting back to us (Ref: ${bookingRef}).`,
      ``,
      `We still need the following to complete your booking: ${missingList}.`,
      ``,
      `Please reply with these details and we will confirm your booking right away.`,
    ].join('\n')
    let sendStatus = 'failed'
    try {
      await sendEmail({ to: senderEmail, subject: `Re: Booking ${bookingRef}`, body, cc: emailCc, ...threading })
      sendStatus = 'sent'
    } catch (e) {
      console.error('[fill-missing] still-missing email failed for', bookingRef, e)
    }
    await supabase.from('message_logs').insert({
      booking_id: booking.id,
      client_id: client?.id || null,
      channel: 'email',
      direction: 'outbound',
      recipient: senderEmail,
      content: body,
      template_used: 'missing_info_request',
      status: sendStatus,
    })
    return
  }

  // All fields complete — check if approval required
  if (booking.company_id) {
    const { data: company } = await supabase.from('companies').select('approval_required').eq('id', booking.company_id).maybeSingle()
    if (company?.approval_required) {
      await supabase.from('bookings').update({ status: 'pending_approval', approval_status: 'pending' }).eq('id', booking.id)
      await supabase.from('booking_status_history').insert({
        booking_id: booking.id, old_status: 'draft', new_status: 'pending_approval', changed_by: 'system',
      })
      return
    }
  }

  // Send booking confirmation
  const tripLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
  const detailLines = [
    `Booking Reference : ${bookingRef}`,
    merged.pickup_location    ? `Pickup            : ${merged.pickup_location}` : null,
    merged.drop_location      ? `Drop              : ${merged.drop_location}` : null,
    merged.pickup_date        ? `Date              : ${formatDate(merged.pickup_date)}` : null,
    merged.pickup_time        ? `Time              : ${formatTime12h(merged.pickup_time)}` : null,
    `Trip Type         : ${tripLabel[booking.trip_type] ?? booking.trip_type ?? 'Local'}`,
    merged.guest_name         ? `Guest             : ${merged.guest_name}` : null,
    merged.special_instructions ? `Note              : ${merged.special_instructions}` : null,
  ].filter(Boolean).join('\n')

  const body = [
    `Hi ${clientName},`,
    ``,
    `We are pleased to confirm your booking with JMS Travels.`,
    ``,
    detailLines,
    ``,
    `Our team will share your driver details once assigned.`,
    ``,
    `Thank you for choosing JMS Travels.`,
  ].join('\n')

  await sendEmail({ to: senderEmail, subject: `Booking Confirmed - ${bookingRef}`, body, cc: emailCc, ...threading }).catch(e => console.error('[fill-missing] confirmation email failed for', bookingRef, e))

  await supabase.from('message_logs').insert({
    booking_id: booking.id,
    client_id: client?.id || null,
    channel: 'email',
    direction: 'outbound',
    recipient: senderEmail,
    content: body,
    template_used: 'booking_received',
    status: 'sent',
  })
}
