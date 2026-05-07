import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  // Client passes local YYYY-MM-DD so IST date matches correctly
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('booking_legs')
    .select(`
      id,
      booking_id,
      day_number,
      leg_date,
      leg_status,
      driver_id,
      driver:drivers!driver_id(id, name, phone, vehicle_name, vehicle_number, vehicle_type),
      booking:bookings!booking_id(
        id, booking_ref, guest_name, trip_type, total_days, status, pickup_location, drop_location,
        client:clients!client_id(name)
      )
    `)
    .eq('leg_date', date)
    .neq('leg_status', 'completed')
    .not('driver_id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Only multi-day local trips that are active
  const filtered = (data ?? []).filter((leg: Record<string, unknown>) => {
    const booking = leg.booking as Record<string, unknown> | null
    return (
      booking?.trip_type === 'local' &&
      (booking?.total_days as number ?? 1) > 1 &&
      ['in_progress', 'confirmed'].includes(booking?.status as string ?? '')
    )
  })

  return NextResponse.json(filtered)
}
