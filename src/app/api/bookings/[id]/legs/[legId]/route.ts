import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppTemplate, sendWhatsAppSmart } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import { formatDate } from '@/lib/utils/date'
import { sendDriverPushNotification } from '@/lib/utils/driver-push'
import { formalName } from '@/lib/utils/client-name'
import { TEMPLATE_KEYS } from '@/lib/templates'
import type { Client } from '@/types'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; legId: string }> }) {
  const { id, legId } = await params
  const supabase = createAdminClient()
  const { driver_id, leg_status } = await request.json()

  const updates: Record<string, unknown> = {}
  if (driver_id !== undefined) updates.driver_id = driver_id
  if (leg_status !== undefined) updates.leg_status = leg_status

  // Capture old leg driver before overwriting (needed to send cancellation notice)
  let oldLegDriverId: string | null = null
  if (driver_id !== undefined) {
    const { data: currentLeg } = await supabase
      .from('booking_legs').select('driver_id').eq('id', legId).single()
    oldLegDriverId = currentLeg?.driver_id ?? null
  }

  const { data, error } = await supabase
    .from('booking_legs')
    .update(updates)
    .eq('id', legId)
    .select('*, driver:drivers(id, name, phone, vehicle_name, vehicle_number)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (driver_id) {
    await supabase.from('drivers').update({ status: 'on_duty' }).eq('id', driver_id)

    const [bookingRes, newDriverRes, legRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, client:clients!client_id(name, primary_phone, primary_email, salutation), company:companies(name, formal_address)')
        .eq('id', id)
        .single(),
      supabase
        .from('drivers')
        .select('name, phone, vehicle_name, vehicle_color, vehicle_number, uses_app, last_app_seen')
        .eq('id', driver_id)
        .single(),
      supabase
        .from('booking_legs')
        .select('day_number, leg_date')
        .eq('id', legId)
        .single(),
    ])

    const booking = bookingRes.data
    const newDriver = newDriverRes.data
    const leg = legRes.data

    if (booking && newDriver && leg) {
      const client = booking.client as Client | null
      const company = booking.company as { name?: string; formal_address?: boolean } | null
      const clientName = formalName(
        booking.guest_name || client?.name || 'there',
        booking.guest_name ? null : client?.salutation,
        company?.formal_address,
      )
      const guestName = booking.guest_name || client?.name || 'Guest'
      const guestPhone = booking.guest_phone || client?.primary_phone || 'TBD'
      const companyName = company?.name || '-'

      const newDriverUsesApp = !!(
        newDriver.uses_app &&
        newDriver.last_app_seen &&
        new Date(newDriver.last_app_seen) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      )

      // --- Driver notification ---
      if (newDriverUsesApp) {
        await supabase.from('message_logs').insert({
          booking_id: id,
          driver_id,
          channel: 'whatsapp',
          direction: 'outbound',
          recipient: newDriver.phone || '',
          content: '[Skipped — driver uses the JMS Driver App and will see this trip automatically]',
          template_used: TEMPLATE_KEYS.LEG_DRIVER_BRIEF,
          status: 'skipped',
        })
      } else if (newDriver.phone) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'
        const arrivedTarget = `${driverStatusLink(appUrl, id, 'arrived')}&leg_id=${legId}`
        const completedTarget = `${driverStatusLink(appUrl, id, 'completed')}&leg_id=${legId}`

        const [arrivedLink, completedLink] = await Promise.all([
          createShortLink(arrivedTarget, id),
          createShortLink(completedTarget, id),
        ])

        const driverFallbackBody = [
          `Hi ${newDriver.name}, you have a new assignment.`,
          ``,
          `Booking: ${booking.booking_ref}`,
          `Company: ${companyName}`,
          `Guest: ${guestName}`,
          `Guest Phone: ${guestPhone}`,
          `Date: ${formatDate(leg.leg_date)}`,
          `Pax: ${booking.pax_count?.toString() || 'TBD'}`,
          ``,
          `Please call JMS Travels Office for pickup and trip details: 9845572207`,
          ``,
          `Tap below to update your trip status:`,
          `Arrived: ${arrivedLink}`,
          `Completed: ${completedLink}`,
          ``,
          `— JMS Travels`,
        ].join('\n')

        const driverSendResult = await sendWhatsAppTemplate({
          to: newDriver.phone,
          templateName: 'jms_leg_driver_brief',
          params: [
            newDriver.name,
            booking.booking_ref,
            companyName,
            guestName,
            guestPhone,
            formatDate(leg.leg_date),
            booking.pax_count?.toString() || 'TBD',
            arrivedLink,
            completedLink,
          ],
          fallbackBody: driverFallbackBody,
          costBookingId: id,
        })

        await Promise.all([
          supabase.from('message_logs').insert({
            booking_id: id,
            driver_id,
            channel: 'whatsapp',
            direction: 'outbound',
            recipient: newDriver.phone,
            content: driverFallbackBody,
            template_used: TEMPLATE_KEYS.LEG_DRIVER_BRIEF,
            status: driverSendResult.ok ? 'sent' : 'failed',
            whatsapp_message_id: driverSendResult.whatsappMessageId ?? null,
          }),
          supabase.from('booking_legs')
            .update({ link_sent_at: new Date().toISOString() })
            .eq('id', legId),
        ])
      }

      // --- Client notification ---
      const clientFallbackBody = [
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
      ].join('\n')

      const guestPhoneRaw = booking.guest_phone || null
      const adminPhone = client?.primary_phone || null
      const clientPhones = [...new Set([guestPhoneRaw, adminPhone].filter(Boolean))] as string[]

      if (clientPhones.length > 0) {
        const clientResults = await Promise.all(
          clientPhones.map(phone => sendWhatsAppSmart({
            to: phone,
            templateName: 'jms_substitute_client',
            params: [
              clientName,
              booking.booking_ref,
              newDriver.name,
              newDriver.phone || '',
              newDriver.vehicle_name || '-',
              newDriver.vehicle_color || '-',
              newDriver.vehicle_number || '-',
            ],
            fallbackBody: clientFallbackBody,
            costBookingId: id,
          }))
        )
        const anyOk = clientResults.some(r => r.ok)
        await supabase.from('message_logs').insert({
          booking_id: id,
          client_id: booking.client_id,
          channel: 'whatsapp',
          direction: 'outbound',
          recipient: clientPhones.join(', '),
          content: clientFallbackBody,
          template_used: TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT,
          status: anyOk ? 'sent' : 'failed',
        })
      } else if (client?.primary_email) {
        const emailResult = await sendEmailSafe({
          to: client.primary_email,
          subject: `Driver Update — ${booking.booking_ref}`,
          body: clientFallbackBody,
          booking_id: id,
        })
        await supabase.from('message_logs').insert({
          booking_id: id,
          client_id: booking.client_id,
          channel: 'email',
          direction: 'outbound',
          recipient: client.primary_email,
          content: clientFallbackBody,
          template_used: TEMPLATE_KEYS.SUBSTITUTE_VEHICLE_CLIENT,
          status: emailResult.ok ? 'sent' : 'failed',
        })
      }

      // Push notification to driver app (non-blocking)
      sendDriverPushNotification(
        driver_id,
        'New Trip Assigned',
        `${booking.booking_ref} · ${formatDate(leg.leg_date)}`,
        { bookingId: id }
      ).catch(() => {})

      // Notify old leg driver their assignment was removed
      if (oldLegDriverId && oldLegDriverId !== driver_id) {
        const { data: oldLegDriver } = await supabase
          .from('drivers')
          .select('name, phone, uses_app, last_app_seen')
          .eq('id', oldLegDriverId)
          .single()
        const oldLegDriverUsesApp = !!(
          oldLegDriver?.uses_app && oldLegDriver?.last_app_seen &&
          new Date(oldLegDriver.last_app_seen) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        )
        if (oldLegDriver?.phone && oldLegDriver?.name && !oldLegDriverUsesApp) {
          const removedFallback = `Hi ${oldLegDriver.name}, Day ${leg.day_number} of booking ${booking.booking_ref} (${formatDate(leg.leg_date)}) has been removed from your schedule. For any queries contact JMS Travels: 9845572207 — JMS Travels`
          const removedResult = await sendWhatsAppSmart({
            to: oldLegDriver.phone,
            templateName: 'jms_leg_removed_driver',
            params: [
              oldLegDriver.name,
              String(leg.day_number),
              booking.booking_ref,
              formatDate(leg.leg_date),
            ],
            fallbackBody: removedFallback,
            costBookingId: id,
          })
          await supabase.from('message_logs').insert({
            booking_id: id,
            driver_id: oldLegDriverId,
            channel: 'whatsapp',
            direction: 'outbound',
            recipient: oldLegDriver.phone,
            content: removedFallback,
            template_used: TEMPLATE_KEYS.LEG_REMOVED_DRIVER,
            status: removedResult.ok ? 'sent' : 'failed',
            whatsapp_message_id: removedResult.whatsappMessageId ?? null,
          })
        }
      }
    }
  }

  return NextResponse.json(data)
}
