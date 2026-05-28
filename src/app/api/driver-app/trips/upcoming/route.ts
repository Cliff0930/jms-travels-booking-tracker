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
  supabase.from('drivers').update({ last_app_seen: new Date().toISOString() }).eq('id', verified.driverId)
  const today = getTodayIST()

  // Find today's current trip (same logic as Today tab: earliest pending trip today)
  const { data: todayTrip } = await supabase
    .from('bookings')
    .select('id')
    .eq('driver_id', verified.driverId)
    .eq('pickup_date', today)
    .not('status', 'in', '("cancelled","completed")')
    .order('pickup_time', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Upcoming = all pending trips from today onwards, excluding the one shown in Today tab
  let query = supabase
    .from('bookings')
    .select('id, booking_ref, pickup_location, drop_location, pickup_location_url, drop_location_url, pickup_date, pickup_time, pax_count, guest_name, guest_phone, special_instructions, status, gps_tracking_enabled, trip_type, booking_legs(id, day_number, leg_date), booker:clients!client_id(name, primary_phone), clients!guest_client_id(is_vip, designation), company:companies!company_id(name)')
    .eq('driver_id', verified.driverId)
    .gte('pickup_date', today)
    .not('status', 'in', '("cancelled","completed")')
    .order('pickup_date', { ascending: true })
    .order('pickup_time', { ascending: true })
    .limit(30)

  if (todayTrip) query = query.neq('id', todayTrip.id)

  const { data } = await query

  return NextResponse.json((data ?? []).map(({ pickup_date, pickup_time, pax_count, guest_name, guest_phone, clients: clientData, booker: bookerData, company: companyData, ...rest }) => {
    const cd = clientData as { is_vip?: boolean | null; designation?: string | null } | null
    const bd = bookerData as { name?: string | null; primary_phone?: string | null } | null
    return {
      ...rest,
      guest_name: guest_name || bd?.name || null,
      guest_phone: guest_phone || bd?.primary_phone || null,
      pickup_datetime: `${pickup_date}T${pickup_time ?? '00:00:00'}`,
      pax: pax_count ?? 0,
      is_vip: cd?.is_vip ?? null,
      guest_designation: cd?.designation ?? null,
      company_name: (companyData as { name?: string } | null)?.name ?? null,
    }
  }))
}
