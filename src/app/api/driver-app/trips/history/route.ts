import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_ref, pickup_location, drop_location, pickup_date, pickup_time, guest_name, status, pax_count')
    .eq('driver_id', verified.driverId)
    .in('status', ['completed', 'cancelled'])
    .order('pickup_date', { ascending: false })
    .limit(50)

  if (!bookings || bookings.length === 0) return NextResponse.json([])

  const { data: sheets } = await supabase
    .from('trip_sheets')
    .select('booking_id, tripsheet_number, opening_km, closing_km, manual_opening_time, manual_closing_time, toll_amount, parking_amount, permit_amount, opening_time, closing_time, bata_driver')
    .in('booking_id', bookings.map(b => b.id))
    .order('created_at', { ascending: true })

  const sheetsByBooking: Record<string, typeof sheets> = {}
  for (const sheet of sheets ?? []) {
    if (!sheetsByBooking[sheet.booking_id]) sheetsByBooking[sheet.booking_id] = []
    sheetsByBooking[sheet.booking_id]!.push(sheet)
  }

  return NextResponse.json(bookings.map(({ pickup_date, pickup_time, pax_count, ...b }) => ({
    ...b,
    pickup_datetime: `${pickup_date}T${pickup_time ?? '00:00:00'}`,
    pax: pax_count ?? 0,
    sheets: sheetsByBooking[b.id] ?? [],
  })))
}
