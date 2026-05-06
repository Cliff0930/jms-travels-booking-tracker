import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmail } from '@/lib/gmail/send'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { new_driver_id, reason, swapped_by } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email)')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('vehicle_swaps').insert({
    booking_id: id,
    original_driver_id: booking.driver_id,
    new_driver_id,
    reason,
    swapped_by: swapped_by || 'operator',
  })

  if (booking.driver_id) {
    await supabase.from('drivers').update({ status: 'available' }).eq('id', booking.driver_id)
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ driver_id: new_driver_id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('drivers').update({ status: 'on_duty' }).eq('id', new_driver_id)

  // Fetch new driver details
  const { data: newDriver } = await supabase
    .from('drivers')
    .select('name, phone, vehicle_name, vehicle_number, vehicle_color')
    .eq('id', new_driver_id)
    .single()

  // Notify client about substitution
  const client = booking.client as Client | null
  const clientName = booking.guest_name || client?.name || 'there'

  const { data: subTmpl } = await supabase
    .from('message_templates')
    .select('body, subject')
    .eq('template_key', TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT)
    .single()

  if (subTmpl && newDriver) {
    const vars = {
      client_name: clientName,
      booking_ref: booking.booking_ref,
      driver_name: newDriver.name,
      driver_phone: newDriver.phone,
      vehicle_name: newDriver.vehicle_name,
      vehicle_color: newDriver.vehicle_color || '',
      vehicle_number: newDriver.vehicle_number,
    }
    const body = fillTemplate(subTmpl.body, vars)
    const subject = fillTemplate(subTmpl.subject || '', vars)

    if (booking.guest_phone || client?.primary_phone) {
      const phone = booking.guest_phone || client?.primary_phone!
      await sendWhatsAppMessage({ to: phone, body }).catch(e => console.error('Substitute WA client error:', e))
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: booking.client_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: phone,
        content: body,
        template_used: TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT,
      })
    } else if (client?.primary_email) {
      await sendEmail({ to: client.primary_email, subject, body }).catch(e => console.error('Substitute email client error:', e))
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: booking.client_id,
        channel: 'email',
        direction: 'outbound',
        recipient: client.primary_email,
        content: body,
        template_used: TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT,
      })
    }
  }

  // Send new trip brief to new driver
  if (newDriver?.phone) {
    const { data: tmpl } = await supabase
      .from('message_templates')
      .select('body')
      .eq('template_key', TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER)
      .single()

    if (tmpl) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'
      const guestName = booking.guest_name || client?.name || 'Guest'
      const guestPhone = booking.guest_phone || client?.primary_phone || 'TBD'
      const body = fillTemplate(tmpl.body, {
        driver_name: newDriver.name,
        booking_ref: booking.booking_ref,
        guest_name: guestName,
        guest_phone: guestPhone,
        pickup_location: booking.pickup_location || 'TBD',
        drop_location: booking.drop_location || 'TBD',
        pickup_date: booking.pickup_date || 'TBD',
        pickup_time: booking.pickup_time || 'TBD',
        pax_count: booking.pax_count?.toString() || 'TBD',
        arrived_link: driverStatusLink(appUrl, id, 'arrived'),
        completed_link: driverStatusLink(appUrl, id, 'completed'),
      })
      await sendWhatsAppMessage({ to: newDriver.phone, body }).catch(e => console.error('Substitute trip brief error:', e))
      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id: new_driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: newDriver.phone,
        content: body,
        template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
      })
    }
  }

  return NextResponse.json(data)
}
