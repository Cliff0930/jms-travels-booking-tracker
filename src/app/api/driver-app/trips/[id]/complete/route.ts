import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'
import { totalDistanceKm } from '@/lib/utils/haversine'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bookingId } = await params
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { closing_km, manual_closing_time, toll_amount, parking_amount, permit_amount, lat, lng, leg_id } =
    await request.json() as {
      closing_km?: number; manual_closing_time?: string
      toll_amount?: number; parking_amount?: number; permit_amount?: number
      lat?: number; lng?: number; leg_id?: string
    }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, driver_id, status')
    .eq('id', bookingId)
    .eq('driver_id', verified.driverId)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'completed') {
    return NextResponse.json({ error: 'Already completed', already_done: true }, { status: 409 })
  }

  // Find matching trip sheet
  let sheetQuery = supabase
    .from('trip_sheets')
    .select('id')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)

  sheetQuery = leg_id ? sheetQuery.eq('booking_leg_id', leg_id) : sheetQuery.is('booking_leg_id', null)
  const { data: sheet } = await sheetQuery.maybeSingle()

  // GPS KM from continuous tracking logs
  let gpsKm: number | null = null
  const { data: gpsLogs } = await supabase
    .from('trip_gps_logs')
    .select('lat, lng')
    .eq('booking_id', bookingId)
    .order('recorded_at', { ascending: true })

  if (gpsLogs && gpsLogs.length >= 2) gpsKm = totalDistanceKm(gpsLogs)

  const sheetUpdate = {
    closing_km: closing_km ?? null,
    closing_lat: lat ?? null,
    closing_lng: lng ?? null,
    closing_time: new Date().toISOString(),
    manual_closing_time: manual_closing_time || null,
    toll_amount: toll_amount ?? null,
    parking_amount: parking_amount ?? null,
    permit_amount: permit_amount ?? null,
    gps_km: gpsKm,
    updated_at: new Date().toISOString(),
  }

  if (sheet) {
    await supabase.from('trip_sheets').update(sheetUpdate).eq('id', sheet.id)
  } else {
    await supabase.from('trip_sheets').insert({
      booking_id: bookingId,
      driver_id: verified.driverId,
      booking_leg_id: leg_id || null,
      ...sheetUpdate,
    })
  }

  await supabase.from('bookings').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', bookingId)
  await supabase.from('drivers').update({ status: 'available' }).eq('id', verified.driverId)

  return NextResponse.json({ ok: true })
}
