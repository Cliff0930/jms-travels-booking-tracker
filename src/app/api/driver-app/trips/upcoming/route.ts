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
    .select('id, booking_ref, pickup_location, drop_location, pickup_location_url, drop_location_url, pickup_date, pickup_time, pax_count, guest_name, guest_phone, special_instructions, status, gps_tracking_enabled, trip_type, booking_legs(id, day_number, leg_date), clients!guest_client_id(is_vip, designation)')
    .eq('driver_id', verified.driverId)
    .gt('pickup_date', today)
    .not('status', 'in', '("cancelled","completed")')
    .order('pickup_date', { ascending: true })
    .order('pickup_time', { ascending: true })
    .limit(30)

  return NextResponse.json((data ?? []).map(({ pickup_date, pickup_time, pax_count, clients: clientData, ...rest }) => {
    const cd = clientData as { is_vip?: boolean | null; designation?: string | null } | null
    return {
      ...rest,
      pickup_datetime: `${pickup_date}T${pickup_time ?? '00:00:00'}`,
      pax: pax_count ?? 0,
      is_vip: cd?.is_vip ?? null,
      guest_designation: cd?.designation ?? null,
    }
  }))
}
