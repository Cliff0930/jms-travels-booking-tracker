import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lat, lng } = await request.json() as { lat?: number; lng?: number }
  if (!lat || !lng) return NextResponse.json({ error: 'lat/lng required' }, { status: 400 })

  const supabase = createAdminClient()
  await supabase.from('trip_gps_logs').insert({
    booking_id: bookingId,
    driver_id: verified.driverId,
    lat,
    lng,
    recorded_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
