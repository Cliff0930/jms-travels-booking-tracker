import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import type { Client } from '@/types'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients(*), company:companies(*)')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'confirmed',
    changed_by: 'operator',
  })

  // Auto-create legs for multi-day bookings
  if (booking.total_days > 1 && booking.pickup_date) {
    const legs = Array.from({ length: booking.total_days }, (_, i) => {
      const date = new Date(booking.pickup_date)
      date.setDate(date.getDate() + i)
      return {
        booking_id: id,
        day_number: i + 1,
        leg_date: date.toISOString().split('T')[0],
        leg_status: 'upcoming',
      }
    })
    await supabase
      .from('booking_legs')
      .upsert(legs, { onConflict: 'booking_id,day_number' })
  }

  // Send booking confirmed notification to client
  const { data: tmpl } = await supabase
    .from('message_templates')
    .select('body, subject')
    .eq('template_key', TEMPLATE_KEYS.BOOKING_CONFIRMED)
    .single()

  if (tmpl) {
    const client = booking.client as Client | null
    const clientName = booking.guest_name || client?.name || 'there'
    const body = fillTemplate(tmpl.body, {
      client_name: clientName,
      booking_ref: booking.booking_ref,
      pickup_date: booking.pickup_date || 'TBD',
      pickup_time: booking.pickup_time || 'TBD',
      pickup_location: booking.pickup_location || 'TBD',
    })

    const phone = client?.primary_phone || booking.guest_phone
    const email = client?.primary_email
    const channel = phone ? 'whatsapp' : email ? 'email' : null

    let status = 'failed'
    if (channel === 'whatsapp' && phone) {
      const result = await sendWhatsAppMessage({ to: phone, body })
      status = result.ok ? 'sent' : `failed: ${result.error}`
    } else if (channel === 'email' && email) {
      try {
        await sendEmail({ to: email, subject: fillTemplate(tmpl.subject || '', { booking_ref: booking.booking_ref }), body })
        status = 'sent'
      } catch (e) { status = `failed: ${String(e)}` }
    }

    if (channel) {
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: client?.id || null,
        channel,
        direction: 'outbound',
        recipient: phone || email,
        content: body,
        template_used: TEMPLATE_KEYS.BOOKING_CONFIRMED,
        status,
      })
    }
  }

  return NextResponse.json(data)
}
