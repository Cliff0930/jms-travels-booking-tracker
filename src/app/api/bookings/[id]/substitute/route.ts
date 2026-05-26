import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendEmailSafe } from '@/lib/gmail/send'
import { sendWhatsAppTemplate, sendWhatsAppSmart } from '@/lib/whatsapp/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import { formatDate, formatTime } from '@/lib/utils/date'
import { sendDriverPushNotification } from '@/lib/utils/driver-push'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { new_driver_id, reason, swapped_by } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email), company:companies(name)')
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

  const { data: newDriver } = await supabase
    .from('drivers')
    .select('name, phone, vehicle_name, vehicle_number, vehicle_color, uses_app, last_app_seen')
    .eq('id', new_driver_id)
    .single()

  const client = booking.client as Client | null
  const clientName = booking.guest_name || client?.name || 'there'

  // Notify client about substitution
  if (newDriver) {
    const vehicleLine = [newDriver.vehicle_name, newDriver.vehicle_color ? `(${newDriver.vehicle_color})` : null].filter(Boolean).join(' ')

    const subFallbackBody = [
      `Hi ${clientName},`,
      ``,
      `Please note that your driver for booking ${booking.booking_ref} has been updated.`,
      ``,
      `New Driver: ${newDriver.name}`,
      `Contact: ${newDriver.phone}`,
      vehicleLine ? `Vehicle: ${vehicleLine}` : null,
      newDriver.vehicle_number ? `Plate No.: ${newDriver.vehicle_number}` : null,
      booking.pickup_location ? `Pickup: ${booking.pickup_location}` : null,
      ``,
      `We apologise for any inconvenience. — JMS Travels`,
    ].filter(Boolean).join('\n')

    const guestPhone = booking.guest_phone || null
    const adminPhone = client?.primary_phone || null
    const phones = [...new Set([guestPhone, adminPhone].filter(Boolean))] as string[]

    if (phones.length > 0) {
      const results = await Promise.all(
        phones.map(phone => sendWhatsAppSmart({
          to: phone,
          templateName: 'jms_substitute_client',
          params: [
            clientName,
            booking.booking_ref,
            newDriver.name,
            newDriver.phone,
            vehicleLine || newDriver.vehicle_name || '-',
            newDriver.vehicle_number || '-',
            booking.pickup_location || 'TBD',
          ],
          fallbackBody: subFallbackBody,
          costBookingId: id,
        }))
      )
      const anyOk = results.some(r => r.ok)
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: booking.client_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: phones.join(', '),
        content: subFallbackBody,
        template_used: TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT,
        status: anyOk ? 'sent' : 'failed',
      })
    } else if (client?.primary_email) {
      const result = await sendEmailSafe({
        to: client.primary_email,
        subject: `Driver Update — ${booking.booking_ref}`,
        body: subFallbackBody,
        booking_id: id,
      })
      await supabase.from('message_logs').insert({
        booking_id: id,
        client_id: booking.client_id,
        channel: 'email',
        direction: 'outbound',
        recipient: client.primary_email,
        content: subFallbackBody,
        template_used: TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT,
        status: result.ok ? 'sent' : 'failed',
      })
    }
  }

  // Send new trip brief to new driver
  if (newDriver?.phone) {
    const newDriverUsesApp = !!(newDriver.uses_app && newDriver.last_app_seen && new Date(newDriver.last_app_seen) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

    if (newDriverUsesApp) {
      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id: new_driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: newDriver.phone,
        content: '[Skipped — driver uses the JMS Driver App and will see this trip automatically]',
        template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
        status: 'skipped',
      })
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'
      const guestName = booking.guest_name || client?.name || 'Guest'
      const guestPhone = booking.guest_phone || client?.primary_phone || 'TBD'
      const [arrivedLink, completedLink] = await Promise.all([
        createShortLink(driverStatusLink(appUrl, id, 'arrived'), id),
        createShortLink(driverStatusLink(appUrl, id, 'completed'), id),
      ])

      const companyName = (booking.company as { name?: string } | null)?.name || null
      const fallbackBody = [
        `Hi ${newDriver.name}, you have a new assignment.`,
        ``,
        `Booking: ${booking.booking_ref}`,
        companyName ? `Company: ${companyName}` : null,
        `Guest: ${guestName}`,
        `Guest Phone: ${guestPhone}`,
        `Pickup: ${booking.pickup_location || 'TBD'}`,
        `Drop: ${booking.drop_location || 'TBD'}`,
        `Date: ${formatDate(booking.pickup_date)}`,
        `Time: ${formatTime(booking.pickup_time)}`,
        `Pax: ${booking.pax_count?.toString() || 'TBD'}`,
        ``,
        `Please confirm receipt. Tap below to update status:`,
        `Arrived: ${arrivedLink}`,
        `Completed: ${completedLink}`,
        ``,
        `— JMS Travels`,
      ].filter(Boolean).join('\n')

      const result = await sendWhatsAppTemplate({
        to: newDriver.phone,
        templateName: 'jms_trip_brief_driver',
        params: [
          newDriver.name,
          booking.booking_ref,
          guestName,
          guestPhone,
          booking.pickup_location || 'TBD',
          booking.drop_location || 'TBD',
          formatDate(booking.pickup_date),
          formatTime(booking.pickup_time),
          booking.pax_count?.toString() || 'TBD',
          arrivedLink,
          completedLink,
        ],
        fallbackBody,
        costBookingId: id,
      })

      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id: new_driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: newDriver.phone,
        content: fallbackBody,
        template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
        status: result.ok ? 'sent' : 'failed',
        whatsapp_message_id: result.whatsappMessageId ?? null,
      })
    }
  }

  // Push notification to new driver app (non-blocking)
  if (newDriver) {
    sendDriverPushNotification(
      new_driver_id,
      'New Trip Assigned',
      `${booking.booking_ref} · ${formatDate(booking.pickup_date)} at ${formatTime(booking.pickup_time)}`,
      { bookingId: id }
    ).catch(() => {})
  }

  return NextResponse.json(data)
}
