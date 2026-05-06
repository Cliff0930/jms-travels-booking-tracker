import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage, sendToAll } from '@/lib/whatsapp/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { driver_id } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients(name, primary_phone, primary_email), driver:drivers(id)')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Conflict check: same driver, same date, overlapping booking
  let dateConflict: string | null = null
  if (booking.pickup_date) {
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('booking_ref')
      .eq('driver_id', driver_id)
      .eq('pickup_date', booking.pickup_date)
      .in('status', ['confirmed', 'in_progress'])
      .neq('id', id)

    if (conflicts && conflicts.length > 0) {
      dateConflict = conflicts[0].booking_ref
    }
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ driver_id, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('drivers').update({ status: 'on_duty' }).eq('id', driver_id)

  // Send trip brief to driver via WhatsApp
  const { data: driver } = await supabase
    .from('drivers')
    .select('name, phone, vehicle_name, vehicle_number, vehicle_color')
    .eq('id', driver_id)
    .single()

  if (driver?.phone) {
    const { data: tmpl } = await supabase
      .from('message_templates')
      .select('body')
      .eq('template_key', TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER)
      .single()

    if (tmpl) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'
      const client = booking.client as Client | null
      const guestName = booking.guest_name || client?.name || 'Guest'
      const guestPhone = booking.guest_phone || client?.primary_phone || 'TBD'

      const body = fillTemplate(tmpl.body, {
        driver_name: driver.name,
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

      await sendWhatsAppMessage({ to: driver.phone, body }).catch(e => console.error('Trip brief WA error:', e))

      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: driver.phone,
        content: body,
        template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
      })
    }
  }

  // Send driver details to guest + admin (deduped)
  if (driver) {
    const client = booking.client as Client & { primary_email?: string } | null
    const guestPhone = booking.guest_phone || null
    const adminPhone = client?.primary_phone || null
    const clientName = booking.guest_name || client?.name || 'there'

    if (booking.pickup_date && booking.pickup_time) {
      const d = new Date(booking.pickup_date + 'T00:00:00Z')
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
      const [hh, mm] = booking.pickup_time.split(':').map(Number)
      const ampm = hh >= 12 ? 'PM' : 'AM'
      const timeStr = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`

      const vehicleLine = [driver.vehicle_name, driver.vehicle_color ? `(${driver.vehicle_color})` : null].filter(Boolean).join(' ')

      const clientBody = [
        `Hi ${clientName}, your driver has been assigned for booking ${booking.booking_ref}.`,
        ``,
        `Driver: ${driver.name}`,
        `Phone: ${driver.phone}`,
        vehicleLine ? `Vehicle: ${vehicleLine}` : null,
        driver.vehicle_number ? `Plate: ${driver.vehicle_number}` : null,
        ``,
        `Your pickup is on ${dateStr} at ${timeStr} from ${booking.pickup_location || 'your pickup point'}.`,
        ``,
        `Please contact the driver directly if needed. — JMS Travels`,
      ].filter(l => l !== null).join('\n')

      await sendToAll([guestPhone, adminPhone], clientBody, {
        booking_id: id,
        client_id: client?.id || undefined,
        template_used: 'driver_details_to_client',
      }).catch(e => console.error('Driver details WA error:', e))
    }
  }

  return NextResponse.json({ ...data, date_conflict: dateConflict })
}
