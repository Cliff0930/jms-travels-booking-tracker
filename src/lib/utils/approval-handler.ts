import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

export async function handleApprovalReply(
  supabase: SupabaseClient,
  rawContent: string,
  senderPhone: string | null,
  senderEmail: string | null
): Promise<boolean> {
  const match = rawContent.trim().match(/^(APPROVE|CONFIRM|REJECT)\s+(BK-\d{4}-\d+)\b/i)
  if (!match) return false

  const action = match[1].toUpperCase()
  const bookingRef = match[2].toUpperCase()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, approval_status, pickup_date, pickup_location, client:clients(name, primary_phone)')
    .eq('booking_ref', bookingRef)
    .single()

  if (!booking || booking.status !== 'pending_approval') return false

  const approved = action === 'APPROVE' || action === 'CONFIRM'
  const approverContact = senderPhone || senderEmail || 'unknown'
  const channel = senderPhone ? 'whatsapp' : 'email'

  if (approved) {
    await supabase.from('bookings').update({
      status: 'draft',
      approval_status: 'approved',
      approved_by: approverContact,
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
      approver_contact: approverContact,
      method: channel,
      note: approved ? 'Approved via reply message' : 'Rejected via reply message',
      actioned_by: approverContact,
    }),
    supabase.from('booking_status_history').insert({
      booking_id: booking.id,
      old_status: booking.status,
      new_status: approved ? 'draft' : 'cancelled',
      changed_by: approverContact,
      note: approved ? `Approval received from ${approverContact}` : `Rejected by ${approverContact}`,
    }),
  ])

  // Notify client on WhatsApp when approved
  if (approved) {
    const client = booking.client as { name?: string; primary_phone?: string } | null
    if (client?.primary_phone) {
      const pickupDate = booking.pickup_date
        ? new Date(booking.pickup_date + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
        : null
      const msg = [
        `Hi ${client.name}, your booking request ${booking.booking_ref} has been approved by your company.`,
        ``,
        pickupDate ? `Date: ${pickupDate}` : null,
        booking.pickup_location ? `Pickup: ${booking.pickup_location}` : null,
        ``,
        `Our team will confirm the final details and share your driver information shortly. Thank you for choosing JMS Travels!`,
      ].filter(Boolean).join('\n')
      await sendWhatsAppMessage({ to: client.primary_phone, body: msg, log: { booking_id: booking.id } }).catch(() => {})
    }
  }

  return true
}
