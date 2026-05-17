import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyDriverToken } from '@/lib/utils/driver-token'

export async function POST(request: Request) {
  const { booking_id, token, lat, lng } = await request.json()

  // Accept either the arrived or completed token
  if (!verifyDriverToken(booking_id, 'arrived', token) && !verifyDriverToken(booking_id, 'completed', token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('gps_tracking_enabled')
    .eq('id', booking_id)
    .single()

  if (!booking?.gps_tracking_enabled) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { data: sheet } = await supabase
    .from('trip_sheets')
    .select('id')
    .eq('booking_id', booking_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  await supabase.from('trip_gps_logs').insert({
    booking_id,
    trip_sheet_id: sheet?.id || null,
    lat,
    lng,
  })

  return NextResponse.json({ ok: true })
}
