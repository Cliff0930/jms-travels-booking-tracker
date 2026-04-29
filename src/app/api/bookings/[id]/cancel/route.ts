import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createAdminClient()
  const { reason } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients(name, primary_phone, primary_email), driver:drivers(name, phone)')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_reason: reason,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'cancelled',
    changed_by: 'operator',
    note: reason,
  })

  if (booking.driver_id) {
    await supabase.from('drivers').update({ status: 'available' }).eq('id', booking.driver_id)
  }

  const vars = {
    booking_ref: booking.booking_ref,
    pickup_date: booking.pickup_date || 'TBD',
    pickup_time: booking.pickup_time || 'TBD',
  }

  // Notify client
  const client = booking.client as Client | null
  const clientName = booking.guest_name || client?.name || 'there'
  const { data: clientTmpl } = await supabase
    .from('message_templates')
    .select('body, subject')
    .eq('template_key', TEMPLATE_KEYS.CANCELLATION_CLIENT)
    .single()

  if (clientTmpl) {
    const body = fillTemplate(clientTmpl.body, { ...vars, client_name: clientName })
    const subject = fillTemplate(clientTmpl.subject || '', vars)

    if (booking.guest_phone || client?.primary_phone) {
      const phone = booking.guest_phone || client?.primary_phone!
      await sendWhatsAppMessage({ to: phone, body }).catch(e => console.error('Cancel WA client error:', e))
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: booking.client_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: phone,
        content: body,
        template_used: TEMPLATE_KEYS.CANCELLATION_CLIENT,
      })
    } else if (client?.primary_email) {
      await sendEmail({ to: client.primary_email, subject, body }).catch(e => console.error('Cancel email client error:', e))
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: booking.client_id,
        channel: 'email',
        direction: 'outbound',
        recipient: client.primary_email,
        content: body,
        template_used: TEMPLATE_KEYS.CANCELLATION_CLIENT,
      })
    }
  }

  // Notify driver
  const driver = booking.driver as { name: string; phone: string } | null
  if (driver?.phone) {
    const { data: driverTmpl } = await supabase
      .from('message_templates')
      .select('body')
      .eq('template_key', TEMPLATE_KEYS.CANCELLATION_DRIVER)
      .single()

    if (driverTmpl) {
      const body = fillTemplate(driverTmpl.body, { ...vars, driver_name: driver.name })
      await sendWhatsAppMessage({ to: driver.phone, body }).catch(e => console.error('Cancel WA driver error:', e))
      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id: booking.driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: driver.phone,
        content: body,
        template_used: TEMPLATE_KEYS.CANCELLATION_DRIVER,
      })
    }
  }

  return NextResponse.json(data)
}
