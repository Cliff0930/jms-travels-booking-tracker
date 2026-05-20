import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send'
import { formatDate } from '@/lib/utils/date'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; legId: string }> }) {
  const { id, legId } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('booking_ref, driver_id, guest_name, client:clients!client_id(name)')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const { data: leg } = await supabase
    .from('booking_legs')
    .select('id, day_number, leg_date, driver_id')
    .eq('id', legId)
    .eq('booking_id', id)
    .single()

  if (!leg) return NextResponse.json({ error: 'Leg not found' }, { status: 404 })

  const driverId = leg.driver_id || booking.driver_id
  if (!driverId) return NextResponse.json({ error: 'No driver assigned to this leg or booking' }, { status: 400 })

  const { data: driver } = await supabase
    .from('drivers')
    .select('name, phone')
    .eq('id', driverId)
    .single()

  if (!driver?.phone) return NextResponse.json({ error: 'Driver has no phone number configured' }, { status: 400 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://booking.jmstravels.net'
  const arrivedTarget = `${driverStatusLink(appUrl, id, 'arrived')}&leg_id=${legId}`
  const completedTarget = `${driverStatusLink(appUrl, id, 'completed')}&leg_id=${legId}`

  const [arrivedLink, completedLink] = await Promise.all([
    createShortLink(arrivedTarget, id),
    createShortLink(completedTarget, id),
  ])

  const legDate = formatDate(leg.leg_date)

  const fallbackBody = [
    `JMS Travels — Day ${leg.day_number} Trip Update`,
    `Booking Ref: ${booking.booking_ref}`,
    `Date: ${legDate}`,
    `Tap below to update your trip status:`,
    `Arrived at pickup: ${arrivedLink}`,
    `Trip completed: ${completedLink}`,
    `Thank you, JMS Travels Team`,
  ].join('\n')

  const result = await sendWhatsAppTemplate({
    to: driver.phone,
    templateName: 'jms_leg_day_links',
    params: [String(leg.day_number), booking.booking_ref, legDate, arrivedLink, completedLink],
    fallbackBody,
  })
  if (!result.ok) return NextResponse.json({ error: result.error || 'WhatsApp send failed' }, { status: 500 })

  await Promise.all([
    supabase.from('message_logs').insert({
      booking_id: id,
      driver_id: driverId,
      channel: 'whatsapp',
      direction: 'outbound',
      recipient: driver.phone,
      content: fallbackBody,
      template_used: 'jms_leg_day_links',
      status: 'sent',
      whatsapp_message_id: result.whatsappMessageId ?? null,
    }),
    supabase.from('booking_legs')
      .update({ link_sent_at: new Date().toISOString() })
      .eq('id', legId),
  ])

  return NextResponse.json({ ok: true, day: leg.day_number })
}
