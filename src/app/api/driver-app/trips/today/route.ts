import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

function getTodayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const today = getTodayIST()

  const { data } = await supabase
    .from('bookings')
    .select('id, booking_ref, pickup_location, drop_location, pickup_location_url, drop_location_url, pickup_date, pickup_time, pax_count, guest_name, guest_phone, special_instructions, status, gps_tracking_enabled, trip_type, booking_legs(id, day_number, leg_date, pickup_location, drop_location, pickup_time)')
    .eq('driver_id', verified.driverId)
    .eq('pickup_date', today)
    .not('status', 'in', '("cancelled","completed")')
    .order('pickup_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!data) return NextResponse.json(null)
  const { pickup_date, pickup_time, pax_count, ...rest } = data

  let active_tripsheet: { tripsheet_number: string | null; opening_km: number | null; manual_opening_time: string | null } | null = null
  if (rest.status === 'in_progress') {
    const { data: sheet } = await supabase
      .from('trip_sheets')
      .select('tripsheet_number, opening_km, manual_opening_time')
      .eq('booking_id', rest.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    active_tripsheet = sheet ?? null
  }

  return NextResponse.json({
    ...rest,
    pickup_datetime: `${pickup_date}T${pickup_time ?? '00:00:00'}`,
    pax: pax_count ?? 0,
    gps_tracking_enabled: !!rest.gps_tracking_enabled,
    active_tripsheet,
  })
}
