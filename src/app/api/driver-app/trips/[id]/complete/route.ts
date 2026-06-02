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

  const { closing_km, manual_closing_time, toll_amount, parking_amount, permit_amount, bata_driver, lat, lng, leg_id, collection_amount, collection_mode } =
    await request.json() as {
      closing_km?: number; manual_closing_time?: string
      toll_amount?: number; parking_amount?: number; permit_amount?: number
      bata_driver?: number
      lat?: number; lng?: number; leg_id?: string
      collection_amount?: number
      collection_mode?: 'cash' | 'phonepe' | 'gpay' | 'cc'
    }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, driver_id, status, is_settlement_duty, trip_type, total_days')
    .eq('id', bookingId)
    .eq('driver_id', verified.driverId)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'completed') {
    return NextResponse.json({ error: 'Already completed', already_done: true }, { status: 409 })
  }

  // Find matching trip sheet (also fetch opening time for bata_client computation)
  let sheetQuery = supabase
    .from('trip_sheets')
    .select('id, manual_opening_time')
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

  // Compute bata_client server-side using client thresholds (open<06:00, close>22:00)
  const parseHHMM = (t: string | null | undefined): number | null => {
    if (!t) return null
    const m = t.match(/^(\d{1,2}):(\d{2})/)
    if (!m) return null
    return parseInt(m[1]) * 60 + parseInt(m[2])
  }
  const openMins  = parseHHMM((sheet as { manual_opening_time?: string | null } | null)?.manual_opening_time)
  const closeMins = parseHHMM(manual_closing_time)
  const midnightCross = closeMins !== null && openMins !== null && closeMins < openMins
  const tripType  = (booking as { trip_type?: string | null }).trip_type ?? 'local'
  const totalDays = (booking as { total_days?: number | null }).total_days ?? 1
  const clientLateNight = closeMins !== null && (closeMins > 22 * 60 || midnightCross) ? 1 : 0
  const clientEarlyMorn = openMins  !== null && openMins < 6 * 60 ? 1 : 0
  const outstationDays  = tripType === 'outstation' ? totalDays : 0
  const bataClient = clientLateNight + clientEarlyMorn + outstationDays

  const sheetUpdate = {
    closing_km: closing_km ?? null,
    closing_lat: lat ?? null,
    closing_lng: lng ?? null,
    closing_time: new Date().toISOString(),
    manual_closing_time: manual_closing_time || null,
    toll_amount: toll_amount ?? null,
    parking_amount: parking_amount ?? null,
    permit_amount: permit_amount ?? null,
    bata_driver: bata_driver ?? null,
    bata_client: bataClient,
    gps_km: gpsKm,
    updated_at: new Date().toISOString(),
  }

  if (sheet) {
    const { error: updateErr } = await supabase.from('trip_sheets').update(sheetUpdate).eq('id', sheet.id)
    if (updateErr) console.error(`[complete] trip_sheets update failed booking=${bookingId}:`, updateErr.message)
  } else {
    const { error: insertErr } = await supabase.from('trip_sheets').insert({
      booking_id: bookingId,
      driver_id: verified.driverId,
      booking_leg_id: leg_id || null,
      ...sheetUpdate,
    })
    if (insertErr) console.error(`[complete] trip_sheets insert failed booking=${bookingId}:`, insertErr.message)
  }

  await supabase.from('bookings').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', bookingId)
  await supabase.from('drivers').update({ status: 'available' }).eq('id', verified.driverId)

  // Auto-insert collection entry if settlement duty and driver recorded collection
  if (booking.is_settlement_duty && collection_amount && collection_amount > 0 && collection_mode) {
    const { data: bk } = await supabase.from('bookings').select('booking_ref').eq('id', bookingId).single()
    await supabase.from('driver_advances').insert({
      driver_id: verified.driverId,
      booking_id: bookingId,
      type: 'collection',
      amount: collection_amount,
      payment_mode: collection_mode,
      note: `Client payment collected at trip completion – ${bk?.booking_ref ?? bookingId}`,
      status: 'outstanding',
    })
  }

  return NextResponse.json({ ok: true })
}
