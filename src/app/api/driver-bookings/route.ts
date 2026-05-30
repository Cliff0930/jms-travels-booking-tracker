import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const driverId = searchParams.get('driver_id')
  if (!driverId) return NextResponse.json([], { status: 400 })

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('id, booking_ref, pickup_date, pickup_location, drop_location, trip_type, status, is_settlement_duty, trip_sheets(tripsheet_number)')
    .eq('driver_id', driverId)
    .not('status', 'in', '("cancelled")')
    .order('pickup_date', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Settlement duty bookings float to top, rest sorted by date desc (already done by query)
  const rows = (data ?? []) as Array<{
    id: string; booking_ref: string; pickup_date: string | null
    pickup_location: string | null; drop_location: string | null
    trip_type: string | null; status: string; is_settlement_duty: boolean
    trip_sheets: Array<{ tripsheet_number: string | null }> | null
  }>

  const settlement = rows.filter(r => r.is_settlement_duty)
  const rest = rows.filter(r => !r.is_settlement_duty)

  return NextResponse.json([...settlement, ...rest].map(r => ({
    id: r.id,
    booking_ref: r.booking_ref,
    pickup_date: r.pickup_date,
    pickup_location: r.pickup_location,
    drop_location: r.drop_location,
    trip_type: r.trip_type,
    status: r.status,
    is_settlement_duty: r.is_settlement_duty,
    tripsheet_number: (r.trip_sheets ?? [])[0]?.tripsheet_number ?? null,
  })))
}
