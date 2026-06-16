import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  let query = supabase
    .from('bookings')
    .select('*, client:clients!client_id(name, primary_phone, primary_email), company:companies!company_id(name), driver:drivers!driver_id(name, phone, vehicle_name, vehicle_number, vehicle_type, vehicle_color, secondary_phone, bata_rate)')
    .order('pickup_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (dateFrom) query = query.gte('pickup_date', dateFrom)
  if (dateTo)   query = query.lte('pickup_date', dateTo)

  const { data: bookings, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bookings?.length) return NextResponse.json([])

  // Batch-fetch trip sheets (most recent per booking) in one query
  const bookingIds = bookings.map(b => b.id)
  const { data: sheets } = await supabase
    .from('trip_sheets')
    .select('booking_id, tripsheet_number, opening_km, closing_km, opening_time, closing_time, manual_opening_time, manual_closing_time, office_to_pickup_km, drop_to_office_km, toll_amount, parking_amount, permit_amount, bata_driver, gps_km, created_at')
    .in('booking_id', bookingIds)
    .order('created_at', { ascending: false })

  type SheetRow = NonNullable<typeof sheets>[number]
  // Take only the most recent sheet per booking
  const sheetByBooking = new Map<string, SheetRow>()
  for (const sheet of sheets || []) {
    if (!sheetByBooking.has(sheet.booking_id)) {
      sheetByBooking.set(sheet.booking_id, sheet)
    }
  }

  const result = bookings.map(b => ({
    ...b,
    trip_sheet: sheetByBooking.get(b.id) ?? null,
  }))

  return NextResponse.json(result)
}
