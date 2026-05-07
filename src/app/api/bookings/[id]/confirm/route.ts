import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage, sendToAll } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import type { Client } from '@/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(*), company:companies(*)')
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
      `Dear ${clientName},`,
      ``,
      `We are delighted to confirm your booking with JMS Travels. Please find the details of your reservation below.`,
      ``,
      detailLines,
      ``,
      `Our team will send you your driver's details once they have been assigned. Should you have any questions or need to make changes to your booking, please do not hesitate to contact us.`,
      ``,
      `Thank you for choosing JMS Travels. We look forward to serving you.`,
    ].join('\n')

    // Send to guest + admin (deduped — if same phone, sends once)
    const guestPhone = booking.guest_phone || null
    const adminPhone = client?.primary_phone || fallbackPhone || null
    const phones = [...new Set([guestPhone, adminPhone].filter(Boolean))] as string[]
    const email = client?.primary_email

    console.log(`[confirm] booking=${id} guest_phone=${guestPhone} admin_phone=${adminPhone}`)

    if (phones.length > 0) {
      await sendToAll(phones, body)
    } else if (email) {
      await sendEmail({ to: email, subject: `Your booking is confirmed — ${booking.booking_ref}`, body }).catch(() => {})
    }

    const recipient = phones.length > 0 ? phones.join(', ') : email || 'unknown'
    await supabase.from('message_logs').insert({
      booking_id: id,
      client_id: client?.id || null,
      channel: phones.length > 0 ? 'whatsapp' : 'email',
      direction: 'outbound',
      recipient,
      content: body,
      template_used: TEMPLATE_KEYS.BOOKING_CONFIRMED,
      status: 'sent',
    })
  }

  return NextResponse.json(data)
}
