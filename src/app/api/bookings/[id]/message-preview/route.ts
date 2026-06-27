import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { TEMPLATE_KEYS } from '@/lib/templates'
import { driverStatusLink } from '@/lib/utils/driver-token'
import { createShortLink } from '@/lib/utils/short-link'
import { formatDate, formatTime } from '@/lib/utils/date'
import type { Client } from '@/types'
import { formalName } from '@/lib/utils/client-name'

type MessageType = 'booking_confirmed' | 'driver_details' | 'trip_brief_driver'
type Channel = 'whatsapp' | 'email'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const message_type = url.searchParams.get('type') as MessageType | null
  const channel = url.searchParams.get('channel') as Channel | null

  if (!message_type || !channel) {
    return NextResponse.json({ error: 'type and channel are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(id, name, primary_phone, primary_email, salutation), company:companies!company_id(name, formal_address), driver:drivers(id, name, phone, secondary_phone, vehicle_name, vehicle_number, vehicle_color, uses_app, last_app_seen)')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const client = booking.client as (Client & { primary_email?: string }) | null
  const driver = booking.driver as {
    id: string; name: string; phone: string; secondary_phone?: string
    vehicle_name?: string; vehicle_number?: string; vehicle_color?: string
    uses_app?: boolean; last_app_seen?: string | null
  } | null

  const previewCompany = booking.company as { formal_address?: boolean } | null
  const clientName = formalName(
    booking.guest_name || client?.name || 'there',
    booking.guest_name ? null : client?.salutation,
    previewCompany?.formal_address,
  )
  const dateFormatted = formatDate(booking.pickup_date)
  const timeFormatted = formatTime(booking.pickup_time)

  let body = ''
  let subject = ''

  if (message_type === 'booking_confirmed') {
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

    subject = `Your booking is confirmed - ${booking.booking_ref}`

  } else if (message_type === 'driver_details') {
    if (!driver) return NextResponse.json({ error: 'No driver assigned' }, { status: 400 })

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

    subject = `Driver Assigned - ${booking.booking_ref}`

  } else if (message_type === 'trip_brief_driver') {
    if (!driver) return NextResponse.json({ error: 'No driver assigned' }, { status: 400 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const guestNameForDriver = booking.guest_name || client?.name || 'Guest'
    const guestPhoneForDriver = booking.guest_phone || client?.primary_phone || 'TBD'
    const companyName = (booking.company as { name?: string } | null)?.name || null
    const [arrivedLink, completedLink] = await Promise.all([
      createShortLink(driverStatusLink(appUrl, id, 'arrived'), id),
      createShortLink(driverStatusLink(appUrl, id, 'completed'), id),
    ])

    const pickupParam = [
      booking.pickup_location || 'TBD',
      booking.pickup_location_url ? `Map: ${booking.pickup_location_url}` : null,
    ].filter(Boolean).join(' | ')
    const dropParam = [
      booking.drop_location || 'TBD',
      booking.drop_location_url ? `Map: ${booking.drop_location_url}` : null,
    ].filter(Boolean).join(' | ')

    body = [
      `Hi ${driver.name}, you have a new assignment.`,
      ``,
      `Booking: ${booking.booking_ref}`,
      companyName ? `Company: ${companyName}` : null,
      `Guest: ${guestNameForDriver}`,
      `Guest Phone: ${guestPhoneForDriver}`,
      `Pickup: ${pickupParam}`,
      `Drop: ${dropParam}`,
      `Date: ${dateFormatted}`,
      `Time: ${timeFormatted}`,
      `Pax: ${booking.pax_count?.toString() || 'TBD'}`,
      ``,
      `Arrived: ${arrivedLink}`,
      `Completed: ${completedLink}`,
      ``,
      `— JMS Travels`,
    ].filter(Boolean).join('\n')

    subject = `Trip Brief - ${booking.booking_ref}`

  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  return NextResponse.json({ body, subject })
}
