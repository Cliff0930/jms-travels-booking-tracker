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
import { formalName, formalGuestName } from '@/lib/utils/client-name'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { new_driver_id, reason, swapped_by } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email, salutation), guest_client:clients!guest_client_id(name, prefix, designation), company:companies(name, formal_address, show_designation), driver:drivers!driver_id(name, phone, uses_app, last_app_seen)')
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

    // Notify old driver that their trip has been cancelled
    const oldDriver = booking.driver as { name?: string; phone?: string; uses_app?: boolean; last_app_seen?: string | null } | null
    const oldDriverUsesApp = !!(oldDriver?.uses_app && oldDriver?.last_app_seen &&
      new Date(oldDriver.last_app_seen) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    if (oldDriver?.phone && oldDriver?.name && !oldDriverUsesApp) {
      const cancelFallback = `Hi ${oldDriver.name}, booking ${booking.booking_ref} for ${formatDate(booking.pickup_date)} at ${formatTime(booking.pickup_time)} has been cancelled. You are now available for new assignments. — JMS Travels`
      const cancelResult = await sendWhatsAppTemplate({
        to: oldDriver.phone,
        templateName: 'jms_cancellation_driver',
        params: [oldDriver.name, booking.booking_ref, formatDate(booking.pickup_date), formatTime(booking.pickup_time)],
        fallbackBody: cancelFallback,
        costBookingId: id,
      })
      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id: booking.driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: oldDriver.phone,
        content: cancelFallback,
        template_used: TEMPLATE_KEYS.CANCELLATION_DRIVER,
        status: cancelResult.ok ? 'sent' : 'failed',
        whatsapp_message_id: cancelResult.whatsappMessageId ?? null,
      })
    }
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
  const guestClientForSub = booking.guest_client as { name?: string; prefix?: string; designation?: string } | null
  const subCompany = booking.company as { formal_address?: boolean; show_designation?: boolean } | null
  const clientName = booking.guest_name
    ? formalGuestName(booking.guest_name, guestClientForSub?.prefix ?? null, guestClientForSub?.designation ?? null, subCompany?.show_designation ?? null)
    : formalName(client?.name || 'there', client?.salutation, subCompany?.formal_address)

  // Notify client about substitution
  if (newDriver) {
    const subFallbackBody = [
      `Hi ${clientName}, we have made a vehicle change for your booking ${booking.booking_ref}. Your updated driver details:`,
      ``,
      `Driver: ${newDriver.name}`,
      `Phone: ${newDriver.phone}`,
      `Vehicle: ${newDriver.vehicle_name || '-'} (${newDriver.vehicle_color || '-'})`,
      `Plate: ${newDriver.vehicle_number || '-'}`,
      ``,
      `We apologise for any inconvenience.`,
      ``,
      `JMS Travels`,
      `9845572207`,
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
            newDriver.vehicle_name || '-',
            newDriver.vehicle_color || '-',
            newDriver.vehicle_number || '-',
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
      const guestName = formalGuestName(
        booking.guest_name || guestClientForSub?.name || client?.name || 'Guest',
        guestClientForSub?.prefix ?? null,
        guestClientForSub?.designation ?? null,
        subCompany?.show_designation ?? null,
      )
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
          companyName || '-',
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
