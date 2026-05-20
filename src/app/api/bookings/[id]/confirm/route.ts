import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import type { Client } from '@/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(*), company:companies(*), cc_emails')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'Cannot confirm a cancelled booking' }, { status: 400 })
  if (booking.status === 'completed') return NextResponse.json({ error: 'Booking is already completed' }, { status: 400 })
  if (booking.status === 'confirmed') return NextResponse.json(booking) // idempotent

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', booking.status) // optimistic lock — only update if status hasn't changed
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'confirmed',
    changed_by: 'operator',
  })

  // Auto-create legs for multi-day bookings (UTC date math to avoid timezone shifts)
  if (booking.total_days > 1 && booking.pickup_date) {
    const legs = Array.from({ length: booking.total_days }, (_, i) => {
      const d = new Date(booking.pickup_date + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      return {
        booking_id: id,
        day_number: i + 1,
        leg_date: d.toISOString().slice(0, 10),
        leg_status: 'upcoming',
      }
    })
    await supabase
      .from('booking_legs')
      .upsert(legs, { onConflict: 'booking_id,day_number' })
  }

  // Send booking confirmed notification to client
  {
    const client = booking.client as Client | null

    // Fallback: look up sender phone from raw_messages linked to this booking
    let fallbackPhone: string | null = null
    if (!client?.primary_phone && !booking.guest_phone) {
      const { data: rawMsg } = await supabase
        .from('raw_messages')
        .select('sender_phone')
        .eq('booking_id', id)
        .not('sender_phone', 'is', null)
        .order('received_at', { ascending: true })
        .limit(1)
        .single()
      fallbackPhone = rawMsg?.sender_phone || null
    }

    const clientName = booking.guest_name || client?.name || 'there'

    const tripTypeLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
    const dateFormatted = booking.pickup_date
      ? new Date(booking.pickup_date + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
      : 'TBD'
    const timeFormatted = (() => {
      if (!booking.pickup_time) return 'TBD'
      const [hh, mm] = booking.pickup_time.split(':').map(Number)
      const ampm = hh >= 12 ? 'PM' : 'AM'
      return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`
    })()

    const detailLines = [
      `Booking Reference : ${booking.booking_ref}`,
      `Pickup            : ${booking.pickup_location || 'TBD'}`,
      booking.drop_location ? `Drop              : ${booking.drop_location}` : null,
      `Date              : ${dateFormatted}`,
      `Time              : ${timeFormatted}`,
      `Trip Type         : ${tripTypeLabel[booking.trip_type] ?? booking.trip_type}`,
      booking.total_days > 1 ? `Duration          : ${booking.total_days} days` : null,
      booking.pax_count ? `Passengers        : ${booking.pax_count}` : null,
      booking.vehicle_type ? `Vehicle           : ${booking.vehicle_type}` : null,
      booking.special_instructions ? `Special Note      : ${booking.special_instructions}` : null,
    ].filter(Boolean).join('\n')

    const body = [
      `Hi ${clientName},`,
      ``,
      `We are delighted to confirm your booking with JMS Travels. Please find the details of your reservation below.`,
      ``,
      detailLines,
      ``,
      `Our team will send you your driver's details once they have been assigned. Should you have any questions or need to make changes to your booking, please do not hesitate to contact us.`,
      ``,
      `Thank you for choosing JMS Travels. We look forward to serving you.`,
    ].join('\n')

    const guestPhone = booking.guest_phone || null
    const adminPhone = client?.primary_phone || fallbackPhone || null
    const phones = [...new Set([guestPhone, adminPhone].filter(Boolean))] as string[]
    const email = client?.primary_email
    const bookingCc: string[] = Array.isArray(booking.cc_emails) ? booking.cc_emails : []

    console.log(`[confirm] booking=${id} source=${booking.source} guest_phone=${guestPhone} admin_phone=${adminPhone}`)

    if (booking.source === 'email') {
      // Email-source bookings: notify via email only
      let emailStatus = email ? 'skipped' : 'skipped'
      if (email) {
        const result = await sendEmailSafe({
          to: email,
          subject: `Your booking is confirmed - ${booking.booking_ref}`,
          body,
          cc: bookingCc.length > 0 ? bookingCc : undefined,
        })
        emailStatus = result.ok ? 'sent' : 'failed'
        if (!result.ok) console.error(`[confirm] Email failed booking=${id} error=${result.error}`)
      }
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: client?.id || null,
        channel: 'email',
        direction: 'outbound',
        recipient: email || 'unknown',
        content: body,
        template_used: TEMPLATE_KEYS.BOOKING_CONFIRMED,
        status: emailStatus,
      })
    } else {
      // WhatsApp-source bookings: send via template (bypasses 24h window), fall back to email
      let channel: 'whatsapp' | 'email' = 'whatsapp'
      let recipient = phones.length > 0 ? phones.join(', ') : email || 'unknown'
      let sendStatus = 'failed'
      let waMessageId: string | undefined

      if (phones.length > 0) {
        const tripTypeLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
        const results = await Promise.all(
          phones.map(phone => sendWhatsAppTemplate({
            to: phone,
            templateName: 'jms_booking_confirmed',
            params: [
              clientName,
              booking.booking_ref,
              booking.pickup_location || 'TBD',
              booking.drop_location || '-',
              dateFormatted,
              timeFormatted,
              tripTypeLabel[booking.trip_type] ?? booking.trip_type,
              booking.total_days > 1 ? `${booking.total_days} days` : '-',
              booking.pax_count ? String(booking.pax_count) : '-',
              booking.vehicle_type || '-',
              booking.special_instructions || '-',
            ],
            fallbackBody: body,
          }))
        )
        const okResult = results.find(r => r.ok)
        sendStatus = okResult ? 'sent' : 'failed'
        waMessageId = okResult?.whatsappMessageId
        if (!okResult) console.error(`[confirm] WhatsApp template failed for all phones booking=${id}`, results)
      } else if (email) {
        channel = 'email'
        recipient = email
        const result = await sendEmailSafe({ to: email, subject: `Your booking is confirmed - ${booking.booking_ref}`, body })
        sendStatus = result.ok ? 'sent' : 'failed'
        if (!result.ok) console.error(`[confirm] Fallback email failed booking=${id} error=${result.error}`)
      }

      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: client?.id || null,
        channel,
        direction: 'outbound',
        recipient,
        content: body,
        template_used: TEMPLATE_KEYS.BOOKING_CONFIRMED,
        status: sendStatus,
        whatsapp_message_id: waMessageId ?? null,
      })
    }
  }

  return NextResponse.json(data)
}
