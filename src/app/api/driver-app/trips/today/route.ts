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
    .select('id, booking_ref, pickup_location, drop_location, pickup_datetime, pax, guest_name, guest_phone, status, gps_tracking_enabled, booking_legs(id, day_number, leg_date, pickup_location, drop_location, pickup_time)')
    .eq('driver_id', verified.driverId)
    .gte('pickup_datetime', `${today}T00:00:00`)
    .lte('pickup_datetime', `${today}T23:59:59`)
    .not('status', 'in', '("cancelled","completed")')
    .order('pickup_datetime', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}
