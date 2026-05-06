import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyApprovalToken } from '@/lib/utils/approval-token'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
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

  if (!bookingId || !action || !token || !verifyApprovalToken(bookingId, action, token)) {
    return html('Invalid Link', '#DC2626', '❌', 'This approval link is invalid or has expired. Please contact JMS Travels directly.')
  }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, approval_status, pickup_date, pickup_time, pickup_location, client:clients!client_id(name, primary_phone)')
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
  const client = booking.client as { name?: string; primary_phone?: string } | null

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

  // Notify client on WhatsApp when approved
  if (approved && client?.primary_phone) {
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
    await sendWhatsAppMessage({ to: client.primary_phone, body: msg, log: { booking_id: bookingId } }).catch(() => {})
  }

  return approved
    ? html('Approved ✓', '#059669', '✅', `Booking ${booking.booking_ref} has been approved. The JMS Travels team has been notified and will confirm the booking shortly.`)
    : html('Rejected', '#DC2626', '❌', `Booking ${booking.booking_ref} has been rejected. The JMS Travels team has been notified.`)
}
