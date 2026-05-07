import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { fillTemplate, TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppMessage, sendToAll } from '@/lib/whatsapp/send'
import { sendEmail } from '@/lib/gmail/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { driver_id } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email), driver:drivers(id)')
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

  // Send driver details — respects company driver_notify_target setting
  if (driver) {
    const client = booking.client as Client & { primary_email?: string } | null

    // Fetch company notification preference
    let notifyTarget = 'both'
    if (booking.company_id) {
      const { data: co } = await supabase.from('companies').select('driver_notify_target').eq('id', booking.company_id).single()
      if (co?.driver_notify_target) notifyTarget = co.driver_notify_target
    }

    const guestPhone = booking.guest_phone || null
    const bookerPhone = client?.primary_phone || null
    const bookerEmail = client?.primary_email || null
    const clientName = booking.guest_name || client?.name || 'there'

    if (booking.pickup_date && booking.pickup_time) {
      const d = new Date(booking.pickup_date + 'T00:00:00Z')
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
      const [hh, mm] = booking.pickup_time.split(':').map(Number)
      const ampm = hh >= 12 ? 'PM' : 'AM'
      const timeStr = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`

      const vehicleLine = [driver.vehicle_name, driver.vehicle_color ? `(${driver.vehicle_color})` : null].filter(Boolean).join(' ')

      const driverDetails = [
        `Driver Name : ${driver.name}`,
        `Contact     : ${driver.phone}`,
        vehicleLine ? `Vehicle     : ${vehicleLine}` : null,
        driver.vehicle_number ? `Plate No.   : ${driver.vehicle_number}` : null,
      ].filter(Boolean).join('\n')

      const driverBody = [
        `Dear ${clientName},`,
        ``,
        `We are pleased to inform you that a driver has been assigned for your upcoming trip (Ref: ${booking.booking_ref}).`,
        ``,
        `Driver Details`,
        `──────────────`,
        driverDetails,
        ``,
        `Your pickup is scheduled for ${dateStr} at ${timeStr} from ${booking.pickup_location || 'your confirmed pickup point'}.`,
        ``,
        `Please feel free to contact your driver directly for any assistance. For any other queries, we are always happy to help.`,
      ].join('\n')

      // WhatsApp — send to guest, booker, or both
      const waRecipients: (string | null)[] =
        notifyTarget === 'guest'  ? [guestPhone] :
        notifyTarget === 'booker' ? [bookerPhone] :
        [guestPhone, bookerPhone]

      await sendToAll(waRecipients, driverBody, {
        booking_id: id,
        client_id: client?.id || undefined,
        template_used: 'driver_details_to_client',
      }).catch(e => console.error('Driver details WA error:', e))

      // Email — send to booker when target is booker or both
      if (bookerEmail && notifyTarget !== 'guest') {
        await sendEmail({
          to: bookerEmail,
          subject: `Driver Assigned — ${booking.booking_ref}`,
          body: driverBody,
        }).catch(e => console.error('Driver details email error:', e))

        await supabase.from('message_logs').insert({
          booking_id: id,
          client_id: client?.id || null,
          channel: 'email',
          direction: 'outbound',
          recipient: bookerEmail,
          content: driverBody,
          template_used: 'driver_details_to_client',
          status: 'sent',
        })
      }
    }
  }

  return NextResponse.json({ ...data, date_conflict: dateConflict })
}
