import { createAdminClient } from '@/lib/supabase/server'
import { verifyApprovalToken } from '@/lib/utils/approval-token'
import { sendWhatsAppSmart } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import { markShortLinkUsed } from '@/lib/utils/short-link'
import { formatDate } from '@/lib/utils/date'
function html(title: string, color: string, heading: string, message: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title} — JMS Travels</title></head>
    <body style="font-family:sans-serif;max-width:440px;margin:60px auto;padding:24px;text-align:center">
      <img src="https://booking.jmstravels.net/logo.png" alt="JMS Travels" style="height:48px;margin-bottom:24px" onerror="this.style.display='none'">
      <div style="font-size:48px;margin-bottom:16px">${heading}</div>
      <h2 style="color:${color};margin:0 0 12px">${title}</h2>
      <p style="color:#555;line-height:1.6">${message}</p>
    </body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const bookingId = searchParams.get('booking')
  const action = searchParams.get('action')
  const token = searchParams.get('token')
  const linkCode = searchParams.get('link_code')

  if (!bookingId || !action || !token || !verifyApprovalToken(bookingId, action, token)) {
    return html('Invalid Link', '#DC2626', '❌', 'This approval link is invalid or has expired. Please contact JMS Travels directly.')
  }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, approval_status, source, pickup_date, pickup_time, pickup_location, guest_name, guest_phone, client:clients!client_id(name, primary_phone, primary_email)')
    .eq('id', bookingId)
    .single()

  if (!booking) {
    return html('Not Found', '#DC2626', '❌', 'Booking not found. Please contact JMS Travels directly.')
  }

  if (booking.status !== 'pending_approval') {
    const already = booking.approval_status === 'approved' ? 'already been approved' : 'already been actioned'
    return html('Already Actioned', '#737686', 'ℹ️', `Booking ${booking.booking_ref} has ${already}. No further action needed.`)
  }

  const approved = action === 'approve'
  const client = booking.client as { name?: string; primary_phone?: string; primary_email?: string } | null

  if (approved) {
    await supabase.from('bookings').update({
      status: 'draft',
      approval_status: 'approved',
      approved_by: 'approver (email link)',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', bookingId)
  } else {
    await supabase.from('bookings').update({
      status: 'cancelled',
      approval_status: 'rejected',
      cancelled_reason: 'Approval rejected via email link',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', bookingId)
  }

  if (linkCode) await markShortLinkUsed(linkCode).catch(() => {})

  await Promise.all([
    supabase.from('approval_logs').insert({
      booking_id: bookingId,
      method: 'email_link',
      note: approved ? 'Approved via email link' : 'Rejected via email link',
      actioned_by: 'approver (email link)',
    }),
    supabase.from('booking_status_history').insert({
      booking_id: bookingId,
      old_status: 'pending_approval',
      new_status: approved ? 'draft' : 'cancelled',
      changed_by: 'approver (email link)',
    }),
  ])

  // Notify client on approval or rejection
  const clientName = booking.guest_name || client?.name || 'there'
  const pickupDate = booking.pickup_date ? formatDate(booking.pickup_date) : null

  const approvedMsg = [
    `Hi ${clientName}, your booking request ${booking.booking_ref} has been approved by your company.`,
    ``,
    pickupDate ? `Date: ${pickupDate}` : null,
    booking.pickup_location ? `Pickup: ${booking.pickup_location}` : null,
    ``,
    `Our team will confirm the final details and share your driver information shortly. Thank you for choosing JMS Travels!`,
  ].filter(Boolean).join('\n')

  const rejectedMsg = [
    `Hi ${clientName}, unfortunately your booking request ${booking.booking_ref} was not approved by your company.`,
    ``,
    `If you believe this is a mistake, please contact your approver or reach out to us directly.`,
    `— JMS Travels`,
  ].join('\n')

  const notifyMsg = approved ? approvedMsg : rejectedMsg
  const notifySubject = approved
    ? `Booking ${booking.booking_ref} approved — JMS Travels`
    : `Booking ${booking.booking_ref} not approved — JMS Travels`

  const templateName = approved ? 'jms_booking_approved' : 'jms_booking_rejected'
  const templateParams = [clientName, booking.booking_ref]

  if (booking.source === 'email' && client?.primary_email) {
    await sendEmailSafe({ to: client.primary_email, subject: notifySubject, body: notifyMsg }).catch(() => {})
    if (booking.guest_phone) {
      await sendWhatsAppSmart({
        to: booking.guest_phone,
        templateName,
        params: templateParams,
        fallbackBody: notifyMsg,
        log: { booking_id: bookingId },
      }).catch(() => {})
    }
  } else {
    const phone = booking.guest_phone || client?.primary_phone
    if (phone) {
      await sendWhatsAppSmart({
        to: phone,
        templateName,
        params: templateParams,
        fallbackBody: notifyMsg,
        log: { booking_id: bookingId },
      }).catch(() => {})
    } else if (client?.primary_email) {
      await sendEmailSafe({ to: client.primary_email, subject: notifySubject, body: notifyMsg }).catch(() => {})
    }
  }

  return approved
    ? html('Approved ✓', '#059669', '✅', `Booking ${booking.booking_ref} has been approved. The JMS Travels team has been notified and will confirm the booking shortly.`)
    : html('Rejected', '#DC2626', '❌', `Booking ${booking.booking_ref} has been rejected. The JMS Travels team has been notified.`)
}
