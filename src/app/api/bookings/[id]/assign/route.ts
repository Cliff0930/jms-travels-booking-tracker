import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import type { Client } from '@/types'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { driver_id, gps_tracking_enabled } = await request.json()

  if (gps_tracking_enabled != null) {
    await supabase.from('bookings').update({ gps_tracking_enabled: !!gps_tracking_enabled }).eq('id', id)
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email), driver:drivers(id), cc_emails, source')
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
    .select('name, phone, secondary_phone, vehicle_name, vehicle_number, vehicle_color')
    .eq('id', driver_id)
    .single()

  if (driver?.phone) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://localhost:3000'
    const client = booking.client as Client | null
    const guestName = booking.guest_name || client?.name || 'Guest'
    const guestPhone = booking.guest_phone || client?.primary_phone || 'TBD'
    const [arrivedLink, completedLink] = await Promise.all([
      createShortLink(driverStatusLink(appUrl, id, 'arrived'), id),
      createShortLink(driverStatusLink(appUrl, id, 'completed'), id),
    ])

    const fallbackBody = [
      `Hi ${driver.name}, you have a new assignment.`,
      ``,
      `Booking: ${booking.booking_ref}`,
      `Guest: ${guestName}`,
      `Guest Phone: ${guestPhone}`,
      `Pickup: ${booking.pickup_location || 'TBD'}`,
      `Drop: ${booking.drop_location || 'TBD'}`,
      `Date: ${booking.pickup_date || 'TBD'}`,
      `Time: ${booking.pickup_time || 'TBD'}`,
      `Pax: ${booking.pax_count?.toString() || 'TBD'}`,
      ``,
      `Please confirm receipt. Tap below to update status:`,
      `Arrived: ${arrivedLink}`,
      `Completed: ${completedLink}`,
      ``,
      `— JMS Travels`,
    ].join('\n')

    const result = await sendWhatsAppTemplate({
      to: driver.phone,
      templateName: 'jms_trip_brief_driver',
      params: [
        driver.name,
        booking.booking_ref,
        guestName,
        guestPhone,
        booking.pickup_location || 'TBD',
        booking.drop_location || 'TBD',
        booking.pickup_date || 'TBD',
        booking.pickup_time || 'TBD',
        booking.pax_count?.toString() || 'TBD',
        arrivedLink,
        completedLink,
      ],
      fallbackBody,
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

      const bookingCc: string[] = Array.isArray(booking.cc_emails) ? booking.cc_emails : []
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
          await sendWhatsAppTemplate({
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
          sendWhatsAppTemplate({
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
