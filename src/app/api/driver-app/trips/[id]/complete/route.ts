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
    .select('id, driver_id, status, is_settlement_duty')
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
    bata_driver: bata_driver ?? null,
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
