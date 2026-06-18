import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppTemplate, sendWhatsAppSmart } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import { formatDate, formatTime } from '@/lib/utils/date'
import { sendDriverPushNotification } from '@/lib/utils/driver-push'
import type { Client } from '@/types'
import { formalName, formalGuestName } from '@/lib/utils/client-name'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { driver_id, gps_tracking_enabled, silent } = await request.json()

  if (gps_tracking_enabled != null) {
    await supabase.from('bookings').update({ gps_tracking_enabled: !!gps_tracking_enabled }).eq('id', id)
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email, salutation), guest_client:clients!guest_client_id(name, prefix, designation), company:companies(name, formal_address, show_designation), driver:drivers(id), cc_emails, source')
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

  if (booking.driver_id && booking.driver_id !== driver_id) {
    await supabase.from('drivers').update({ status: 'available' }).eq('id', booking.driver_id)
  }
  await supabase.from('drivers').update({ status: 'on_duty' }).eq('id', driver_id)

  // Send trip brief to driver via WhatsApp
  const { data: driver } = await supabase
    .from('drivers')
    .select('name, phone, secondary_phone, vehicle_name, vehicle_number, vehicle_color, uses_app, last_app_seen')
    .eq('id', driver_id)
    .single()

  const driverUsesApp = !!(driver?.uses_app && driver?.last_app_seen && new Date(driver.last_app_seen) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  if (silent) {
    await supabase.from('message_logs').insert({
      booking_id: id,
      driver_id,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: driver?.phone ?? 'unknown',
      content: '[Skipped — silent assignment (backdated trip)]',
      template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
      status: 'skipped',
    })
    return NextResponse.json({ ...data, date_conflict: dateConflict })
  }

  if (driver?.phone) {
    if (driverUsesApp) {
      // Driver uses the JMS Driver App — they see new trips automatically via polling
      await supabase.from('message_logs').insert({
        booking_id: id,
        driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: driver.phone,
        content: '[Skipped — driver uses the JMS Driver App and will see this trip automatically]',
        template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
        status: 'skipped',
      })
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'
      const client = booking.client as Client | null
      const guestClientRecord = booking.guest_client as { name?: string; prefix?: string; designation?: string } | null
      const company = booking.company as { name?: string; formal_address?: boolean; show_designation?: boolean } | null
      const rawGuestName = booking.guest_name || guestClientRecord?.name || client?.name || 'Guest'
      const guestName = formalGuestName(
        rawGuestName,
        guestClientRecord?.prefix ?? null,
        guestClientRecord?.designation ?? null,
        company?.show_designation ?? null,
      )
      const guestPhone = booking.guest_phone || client?.primary_phone || 'TBD'
      const [arrivedLink, completedLink] = await Promise.all([
        createShortLink(driverStatusLink(appUrl, id, 'arrived'), id),
        createShortLink(driverStatusLink(appUrl, id, 'completed'), id),
      ])

      const companyName = (booking.company as { name?: string } | null)?.name || null

      // Embed map URL directly inside the pickup/drop param so it's part of the
      // approved template — avoids sending a separate free-form message that
      // requires an open 24h window which drivers may not have.
      const pickupParam = [
        booking.pickup_location || 'TBD',
        booking.pickup_location_url ? `Map: ${booking.pickup_location_url}` : null,
      ].filter(Boolean).join(' | ')
      const dropParam = [
        booking.drop_location || 'TBD',
        booking.drop_location_url ? `Map: ${booking.drop_location_url}` : null,
      ].filter(Boolean).join(' | ')

      const fallbackBody = [
        `Hi ${driver.name}, you have a new assignment.`,
        ``,
        `Booking: ${booking.booking_ref}`,
        companyName ? `Company: ${companyName}` : null,
        `Guest: ${guestName}`,
        `Guest Phone: ${guestPhone}`,
        `Pickup: ${pickupParam}`,
        `Drop: ${dropParam}`,
        `Date: ${formatDate(booking.pickup_date)}`,
        `Time: ${formatTime(booking.pickup_time)}`,
        `Pax: ${booking.pax_count?.toString() || 'TBD'}`,
        ``,
        `Please confirm receipt. Tap below to update status:`,
        `Arrived: ${arrivedLink}`,
        `Completed: ${completedLink}`,
        ``,
        `— JMS Travels`,
      ].filter(line => line !== null).join('\n')

      const result = await sendWhatsAppTemplate({
        to: driver.phone,
        templateName: 'jms_trip_brief_driver',
        params: [
          driver.name,
          booking.booking_ref,
          companyName || '-',
          guestName,
          guestPhone,
          pickupParam,
          dropParam,
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
        driver_id,
        channel: 'whatsapp',
        direction: 'outbound',
        recipient: driver.phone,
        content: fallbackBody,
        template_used: TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER,
        status: result.ok ? 'sent' : 'failed',
        whatsapp_message_id: result.whatsappMessageId ?? null,
      })
    }
  }

  // Push notification to driver app (non-blocking — works alongside or instead of WhatsApp)
  if (driver) {
    sendDriverPushNotification(
      driver_id,
      'New Trip Assigned',
      `${booking.booking_ref} · ${formatDate(booking.pickup_date)} at ${formatTime(booking.pickup_time)}`,
      { bookingId: id }
    ).catch(() => {})
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
    const companyForName = booking.company as { formal_address?: boolean; show_designation?: boolean } | null
    const guestClientForName = booking.guest_client as { name?: string; prefix?: string; designation?: string } | null
    const clientName = booking.guest_name
      ? formalGuestName(booking.guest_name, guestClientForName?.prefix ?? null, guestClientForName?.designation ?? null, companyForName?.show_designation ?? null)
      : formalName(client?.name || 'there', client?.salutation, companyForName?.formal_address)

    if (booking.pickup_date && booking.pickup_time) {
      const dateStr = formatDate(booking.pickup_date)
      const timeStr = formatTime(booking.pickup_time)

      const vehicleLine = [driver.vehicle_name, driver.vehicle_color ? `(${driver.vehicle_color})` : null].filter(Boolean).join(' ')

      const contactLine = driver.secondary_phone
        ? `${driver.phone} / ${driver.secondary_phone}`
        : driver.phone

      const driverDetails = [
        `Driver Name : ${driver.name}`,
        `Contact     : ${contactLine}`,
        vehicleLine ? `Vehicle     : ${vehicleLine}` : null,
        driver.vehicle_number ? `Plate No.   : ${driver.vehicle_number}` : null,
      ].filter(Boolean).join('\n')

      const driverBody = [
        `Hi ${clientName},`,
        ``,
        `We are pleased to inform you that a driver has been assigned for your upcoming trip (Ref: ${booking.booking_ref}).`,
        ``,
        `Driver Details`,
        `--------------`,
        driverDetails,
        ``,
        `Your pickup is scheduled for ${dateStr} at ${timeStr} from ${booking.pickup_location || 'your confirmed pickup point'}.`,
        ``,
        `Please feel free to contact your driver directly for any assistance. For any other queries, we are always happy to help.`,
      ].join('\n')

      const bookingCc: string[] = (Array.isArray(booking.cc_emails) ? booking.cc_emails as string[] : [])
        .filter((e: string) => !e.toLowerCase().includes('bookings@jmstravels.net'))
      const isEmailSource = booking.source === 'email'

      // Template params for jms_driver_assigned:
      // {{1}}=client_name {{2}}=booking_ref {{3}}=driver_name {{4}}=driver_contact
      // {{5}}=vehicle_info {{6}}=date {{7}}=time {{8}}=pickup_location
      const driverTemplateParams = [
        clientName,
        booking.booking_ref,
        driver.name,
        contactLine,
        vehicleLine || driver.vehicle_name || '-',
        driver.vehicle_number || '-',
        dateStr,
        timeStr,
        booking.pickup_location || 'your confirmed pickup point',
      ]

      if (isEmailSource) {
        // Email-source bookings: send email to booker + WhatsApp template to guest
        if (bookerEmail) {
          const result = await sendEmailSafe({
            to: bookerEmail,
            subject: `Driver Assigned - ${booking.booking_ref}`,
            body: driverBody,
            cc: bookingCc.length > 0 ? bookingCc : undefined,
            booking_id: id,
          })
          if (!result.ok) console.error(`[assign] Driver email failed booking=${id} error=${result.error}`)

          await supabase.from('message_logs').insert({
            booking_id: id,
            client_id: client?.id || null,
            channel: 'email',
            direction: 'outbound',
            recipient: bookerEmail,
            content: driverBody,
            template_used: 'driver_details_to_client',
            status: result.ok ? 'sent' : 'failed',
          })
        }
        if (guestPhone) {
          await sendWhatsAppSmart({
            to: guestPhone,
            templateName: 'jms_driver_assigned',
            params: driverTemplateParams,
            fallbackBody: driverBody,
            log: { booking_id: id, client_id: client?.id || undefined, template_used: 'driver_details_to_client' },
          })
        }
      } else {
        // WhatsApp-source bookings: use company notify target preference
        const waRecipients = (
          notifyTarget === 'guest'  ? [guestPhone] :
          notifyTarget === 'booker' ? [bookerPhone] :
          [guestPhone, bookerPhone]
        ).filter((p): p is string => !!p)

        await Promise.all(waRecipients.map(phone =>
          sendWhatsAppSmart({
            to: phone,
            templateName: 'jms_driver_assigned',
            params: driverTemplateParams,
            fallbackBody: driverBody,
            log: { booking_id: id, client_id: client?.id || undefined, template_used: 'driver_details_to_client' },
          })
        ))

        if (bookerEmail && notifyTarget !== 'guest') {
          const result = await sendEmailSafe({
            to: bookerEmail,
            subject: `Driver Assigned - ${booking.booking_ref}`,
            body: driverBody,
            booking_id: id,
          })
          if (!result.ok) console.error(`[assign] Driver email (WA source) failed booking=${id} error=${result.error}`)

          await supabase.from('message_logs').insert({
            booking_id: id,
            client_id: client?.id || null,
            channel: 'email',
            direction: 'outbound',
            recipient: bookerEmail,
            content: driverBody,
            template_used: 'driver_details_to_client',
            status: result.ok ? 'sent' : 'failed',
          })
        }
      }
    }
  }

  return NextResponse.json({ ...data, date_conflict: dateConflict })
}
