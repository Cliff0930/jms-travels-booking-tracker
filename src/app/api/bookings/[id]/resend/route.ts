import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { sendEmailSafe } from '@/lib/gmail/send'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import type { Client } from '@/types'

type MessageType = 'booking_confirmed' | 'driver_details' | 'trip_brief_driver'
type Channel = 'whatsapp' | 'email'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const {
    message_type,
    channel,
    override_recipient,
  }: { message_type: MessageType; channel: Channel; override_recipient?: string } = await request.json()

  if (!message_type || !channel) {
    return NextResponse.json({ error: 'message_type and channel are required' }, { status: 400 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(id, name, primary_phone, primary_email), driver:drivers(id, name, phone, secondary_phone, vehicle_name, vehicle_number, vehicle_color), cc_emails, source')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const client = booking.client as (Client & { primary_email?: string }) | null
  const driver = booking.driver as { id: string; name: string; phone: string; secondary_phone?: string; vehicle_name?: string; vehicle_number?: string; vehicle_color?: string } | null

  const clientName = booking.guest_name || client?.name || 'there'
  const guestPhone = booking.guest_phone || null
  const bookerPhone = client?.primary_phone || null
  const bookerEmail = client?.primary_email || null
  const bookingCc: string[] = Array.isArray(booking.cc_emails) ? booking.cc_emails : []

  const dateFormatted = booking.pickup_date
    ? new Date(booking.pickup_date + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : 'TBD'
  const timeFormatted = (() => {
    if (!booking.pickup_time) return 'TBD'
    const [hh, mm] = booking.pickup_time.split(':').map(Number)
    const ampm = hh >= 12 ? 'PM' : 'AM'
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${ampm}`
  })()

  let body = ''
  let subject = ''
  let templateUsed = ''
  let templateName = ''
  let templateParams: string[] = []
  let recipient = override_recipient?.trim() || ''

  if (message_type === 'booking_confirmed') {
    templateUsed = TEMPLATE_KEYS.BOOKING_CONFIRMED
    templateName = 'jms_booking_confirmed'

    const tripTypeLabel: Record<string, string> = { local: 'Local', outstation: 'Outstation', airport: 'Airport' }
    const tripType = tripTypeLabel[booking.trip_type] ?? booking.trip_type
    const detailLines = [
      `Booking Reference : ${booking.booking_ref}`,
      `Pickup            : ${booking.pickup_location || 'TBD'}`,
      booking.drop_location ? `Drop              : ${booking.drop_location}` : null,
      `Date              : ${dateFormatted}`,
      `Time              : ${timeFormatted}`,
      `Trip Type         : ${tripType}`,
      booking.total_days > 1 ? `Duration          : ${booking.total_days} days` : null,
      booking.pax_count ? `Passengers        : ${booking.pax_count}` : null,
      booking.vehicle_type ? `Vehicle           : ${booking.vehicle_type}` : null,
      booking.special_instructions ? `Special Note      : ${booking.special_instructions}` : null,
    ].filter(Boolean).join('\n')

    body = [
      `Hi ${clientName},`,
      ``,
      `We are delighted to confirm your booking with JMS Travels. Please find the details of your reservation below.`,
      ``,
      detailLines,
      ``,
      `Our team will send you your driver's details once they have been assigned. Should you have any questions or need to make changes to your booking, please do not hesitate to contact us.`,
      ``,
      `Thank you for choosing JMS Travels. We look forward to serving you.`,
    ].join('\n')

    templateParams = [
      clientName,
      booking.booking_ref,
      booking.pickup_location || 'TBD',
      booking.drop_location || '-',
      dateFormatted,
      timeFormatted,
      tripType,
      booking.total_days > 1 ? `${booking.total_days} days` : '-',
      booking.pax_count ? String(booking.pax_count) : '-',
      booking.vehicle_type || '-',
      booking.special_instructions || '-',
    ]

    subject = `Your booking is confirmed - ${booking.booking_ref}`
    if (!recipient) recipient = channel === 'email' ? (bookerEmail || '') : (guestPhone || bookerPhone || '')

  } else if (message_type === 'driver_details') {
    if (!driver) return NextResponse.json({ error: 'No driver assigned to this booking' }, { status: 400 })
    templateUsed = 'driver_details_to_client'
    templateName = 'jms_driver_assigned'

    const vehicleLine = [driver.vehicle_name, driver.vehicle_color ? `(${driver.vehicle_color})` : null].filter(Boolean).join(' ')
    const contactLine = driver.secondary_phone ? `${driver.phone} / ${driver.secondary_phone}` : driver.phone

    const driverDetails = [
      `Driver Name : ${driver.name}`,
      `Contact     : ${contactLine}`,
      vehicleLine ? `Vehicle     : ${vehicleLine}` : null,
      driver.vehicle_number ? `Plate No.   : ${driver.vehicle_number}` : null,
    ].filter(Boolean).join('\n')

    body = [
      `Hi ${clientName},`,
      ``,
      `We are pleased to inform you that a driver has been assigned for your upcoming trip (Ref: ${booking.booking_ref}).`,
      ``,
      `Driver Details`,
      `--------------`,
      driverDetails,
      ``,
      `Your pickup is scheduled for ${dateFormatted} at ${timeFormatted} from ${booking.pickup_location || 'your confirmed pickup point'}.`,
      ``,
      `Please feel free to contact your driver directly for any assistance. For any other queries, we are always happy to help.`,
    ].join('\n')

    templateParams = [
      clientName,
      booking.booking_ref,
      driver.name,
      contactLine,
      vehicleLine || driver.vehicle_name || '-',
      driver.vehicle_number || '-',
      dateFormatted,
      timeFormatted,
      booking.pickup_location || 'your confirmed pickup point',
    ]

    subject = `Driver Assigned - ${booking.booking_ref}`
    if (!recipient) recipient = channel === 'email' ? (bookerEmail || '') : (guestPhone || bookerPhone || '')

  } else if (message_type === 'trip_brief_driver') {
    if (!driver) return NextResponse.json({ error: 'No driver assigned to this booking' }, { status: 400 })
    templateUsed = TEMPLATE_KEYS.TRIP_BRIEF_TO_DRIVER
    templateName = 'jms_trip_brief_driver'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const guestNameForDriver = booking.guest_name || client?.name || 'Guest'
    const guestPhoneForDriver = booking.guest_phone || client?.primary_phone || 'TBD'
    const [arrivedLink, completedLink] = await Promise.all([
      createShortLink(driverStatusLink(appUrl, id, 'arrived'), id),
      createShortLink(driverStatusLink(appUrl, id, 'completed'), id),
    ])

    templateParams = [
      driver.name,
      booking.booking_ref,
      guestNameForDriver,
      guestPhoneForDriver,
      booking.pickup_location || 'TBD',
      booking.drop_location || 'TBD',
      booking.pickup_date || 'TBD',
      booking.pickup_time || 'TBD',
      booking.pax_count?.toString() || 'TBD',
      arrivedLink,
      completedLink,
    ]

    body = [
      `Hi ${driver.name}, you have a new assignment.`,
      ``,
      `Booking: ${booking.booking_ref}`,
      `Guest: ${guestNameForDriver}`,
      `Guest Phone: ${guestPhoneForDriver}`,
      `Pickup: ${booking.pickup_location || 'TBD'}`,
      `Drop: ${booking.drop_location || 'TBD'}`,
      `Date: ${booking.pickup_date || 'TBD'}`,
      `Time: ${booking.pickup_time || 'TBD'}`,
      `Pax: ${booking.pax_count?.toString() || 'TBD'}`,
      ``,
      `Arrived: ${arrivedLink}`,
      `Completed: ${completedLink}`,
      ``,
      `— JMS Travels`,
    ].join('\n')

    subject = `Trip Brief - ${booking.booking_ref}`
    if (!recipient) recipient = driver.phone

  } else {
    return NextResponse.json({ error: 'Invalid message_type' }, { status: 400 })
  }

  if (!recipient) {
    return NextResponse.json({ error: 'No recipient available — enter a phone number or email' }, { status: 400 })
  }

  let sendOk = false
  let sendError: string | undefined
  let waMessageId: string | undefined

  if (channel === 'whatsapp') {
    const result = await sendWhatsAppTemplate({ to: recipient, templateName, params: templateParams, fallbackBody: body })
    sendOk = result.ok
    sendError = result.error
    waMessageId = result.whatsappMessageId
  } else {
    const result = await sendEmailSafe({ to: recipient, subject, body, cc: message_type === 'booking_confirmed' && bookingCc.length ? bookingCc : undefined })
    sendOk = result.ok
    sendError = result.error
  }

  await supabase.from('message_logs').insert({
    booking_id: id,
    client_id: client?.id || null,
    channel,
    direction: 'outbound',
    recipient,
    content: body,
    template_used: templateUsed,
    status: sendOk ? 'sent' : 'failed',
    whatsapp_message_id: waMessageId ?? null,
  })

  if (!sendOk) {
    return NextResponse.json({ error: `Send failed: ${sendError}` }, { status: 502 })
  }

  return NextResponse.json({ ok: true, recipient, channel })
}
