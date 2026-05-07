import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import { sendWhatsAppMessage } from '@/lib/whatsapp/send'

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

  // Use leg's own driver if assigned, otherwise fall back to booking driver
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

  const legDate = new Date(leg.leg_date + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  })

  const body = [
    `Day ${leg.day_number} — JMS Travels`,
    `Ref: ${booking.booking_ref} | Date: ${legDate}`,
    ``,
    `🟢 Arrived: ${arrivedLink}`,
    `✅ Completed: ${completedLink}`,
  ].join('\n')

  const result = await sendWhatsAppMessage({ to: driver.phone, body })
  if (!result.ok) return NextResponse.json({ error: result.error || 'WhatsApp send failed' }, { status: 500 })

  await supabase.from('message_logs').insert({
    booking_id: id,
    driver_id: driverId,
    channel: 'whatsapp',
    direction: 'outbound',
    recipient: driver.phone,
    content: body,
    template_used: 'day_links',
  })

  return NextResponse.json({ ok: true, day: leg.day_number })
}
