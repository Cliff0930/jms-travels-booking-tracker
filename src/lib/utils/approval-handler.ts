import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import { notifyOperator } from '@/lib/utils/notify-operator'
import { formatDate } from '@/lib/utils/date'

const CANCELLABLE_STATUSES = ['draft', 'confirmed', 'pending_approval', 'pending']

export async function handleApprovalReply(
  supabase: SupabaseClient,
  rawContent: string,
  senderPhone: string | null,
  senderEmail: string | null
): Promise<boolean> {
  const match = rawContent.trim().match(/^(APPROVE|CONFIRM|REJECT|CANCEL)\s+(BK-\d{4}-\d+)(?:\s+(.+))?/i)
  if (!match) return false

  const action = match[1].toUpperCase()
  const bookingRef = match[2].toUpperCase()
  const extraText = match[3]?.trim() || null

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, approval_status, pickup_date, pickup_location, source, client:clients!client_id(name, primary_phone, primary_email)')
    .eq('booking_ref', bookingRef)
    .maybeSingle()

  if (!booking) return false

  const senderContact = senderPhone || senderEmail || 'unknown'
  const channel = senderPhone ? 'whatsapp' : 'email'

  // ── CANCEL path ────────────────────────────────────────────────────────────
  if (action === 'CANCEL') {
    if (!CANCELLABLE_STATUSES.includes(booking.status)) return false

    const cancelReason = extraText || 'Cancelled by client via reply message'

    await supabase.from('bookings').update({
      status: 'cancelled',
      cancelled_reason: cancelReason,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id)

    await Promise.all([
      supabase.from('booking_status_history').insert({
        booking_id: booking.id,
        old_status: booking.status,
        new_status: 'cancelled',
        changed_by: senderContact,
        note: `Cancelled via ${channel} reply: ${cancelReason}`,
      }),
    ])

    notifyOperator(
      `❌ Booking cancelled by client\n\nRef: ${booking.booking_ref}\nBy: ${senderContact} via ${channel}\nReason: ${cancelReason}\nPrev status: ${booking.status}\n\nVerify if intentional.`,
      'ops'
    ).catch(() => {})

    // Acknowledge the cancellation back to sender
    if (senderEmail) {
      const pickupDate = booking.pickup_date ? formatDate(booking.pickup_date) : null
      const body = [
        `Hi,`,
        ``,
        `Your booking ${booking.booking_ref} has been cancelled as requested.`,
        pickupDate ? `\nOriginal pickup: ${pickupDate}${booking.pickup_location ? ` from ${booking.pickup_location}` : ''}` : null,
        ``,
        `If this was a mistake, please contact us at 9845572207 and we will reinstate the booking.`,
        ``,
        `Thank you for choosing JMS Travels.`,
      ].filter(Boolean).join('\n')
      await sendEmail({ to: senderEmail, subject: `Booking Cancelled - ${booking.booking_ref}`, body }).catch(e => console.error('[approval-handler] cancel ack email failed for', booking.booking_ref, e))
    }

    if (senderPhone) {
      const body = `Your booking ${booking.booking_ref} has been cancelled as requested. If this was a mistake, please call us at 9845572207. — JMS Travels`
      await sendWhatsAppMessage({ to: senderPhone, body, log: { booking_id: booking.id } }).catch(e => console.error('[approval-handler] cancel ack WA failed for', booking.booking_ref, e))
    }

    return true
  }

  // ── APPROVE / REJECT path ──────────────────────────────────────────────────
  if (booking.status !== 'pending_approval') return false

  const approved = action === 'APPROVE' || action === 'CONFIRM'

  if (approved) {
    await supabase.from('bookings').update({
      status: 'draft',
      approval_status: 'approved',
      approved_by: senderContact,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id)
  } else {
    await supabase.from('bookings').update({
      status: 'cancelled',
      approval_status: 'rejected',
      cancelled_reason: 'Approval rejected by approver',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', booking.id)
  }

  await Promise.all([
    supabase.from('approval_logs').insert({
      booking_id: booking.id,
      approver_contact: senderContact,
      method: channel,
      note: approved ? 'Approved via reply message' : 'Rejected via reply message',
      actioned_by: senderContact,
    }),
    supabase.from('booking_status_history').insert({
      booking_id: booking.id,
      old_status: booking.status,
      new_status: approved ? 'draft' : 'cancelled',
      changed_by: senderContact,
      note: approved ? `Approval received from ${senderContact}` : `Rejected by ${senderContact}`,
    }),
  ])

  // Notify client on WhatsApp and/or email when approved
  if (approved) {
    const client = booking.client as { name?: string; primary_phone?: string; primary_email?: string } | null
    const pickupDate = booking.pickup_date ? formatDate(booking.pickup_date) : null

    if (client?.primary_phone) {
      const msg = [
        `Hi ${client.name}, your booking request ${booking.booking_ref} has been approved by your company.`,
        ``,
        pickupDate ? `Date: ${pickupDate}` : null,
        booking.pickup_location ? `Pickup: ${booking.pickup_location}` : null,
        ``,
        `Our team will confirm the final details and share your driver information shortly. Thank you for choosing JMS Travels!`,
      ].filter(Boolean).join('\n')
      await sendWhatsAppMessage({ to: client.primary_phone, body: msg, log: { booking_id: booking.id } }).catch(e => console.error('[approval-handler] WhatsApp notify failed for', booking.booking_ref, e))
    }

    if (client?.primary_email) {
      const emailBody = [
        `Hi ${client.name || 'there'},`,
        ``,
        `Your booking request ${booking.booking_ref} has been approved by your company.`,
        ``,
        pickupDate ? `Date    : ${pickupDate}` : null,
        booking.pickup_location ? `Pickup  : ${booking.pickup_location}` : null,
        ``,
        `Our team will share your driver details once assigned. Thank you for choosing JMS Travels!`,
      ].filter(Boolean).join('\n')
      await sendEmail({ to: client.primary_email, subject: `Booking Approved - ${booking.booking_ref}`, body: emailBody }).catch(e => console.error('[approval-handler] email notify failed for', booking.booking_ref, e))
    }
  }

  return true
}
