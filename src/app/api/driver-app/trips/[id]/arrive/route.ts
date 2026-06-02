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

  const { tripsheet_number, opening_km, manual_opening_time, lat, lng, leg_id } =
    await request.json() as {
      tripsheet_number?: string; opening_km?: number; manual_opening_time?: string
      lat?: number; lng?: number; leg_id?: string
    }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, driver_id, status, gps_tracking_enabled, trip_type, pickup_date')
    .eq('id', bookingId)
    .eq('driver_id', verified.driverId)
    .maybeSingle()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status === 'in_progress') {
    return NextResponse.json({ error: 'Already marked arrived', already_done: true }, { status: 409 })
  }

  // Auto-suffix duplicate tripsheet numbers
  let finalTripsheetNumber: string | null = tripsheet_number || null
  if (tripsheet_number) {
    const { data: existing } = await supabase
      .from('trip_sheets')
      .select('tripsheet_number')
      .or(`tripsheet_number.eq.${tripsheet_number},tripsheet_number.like.${tripsheet_number}+%`)
    if (existing && existing.length > 0) {
      finalTripsheetNumber = `${tripsheet_number}+${existing.length}`
    }
  }

  const todayIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await supabase.from('bookings').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', bookingId)
  await supabase.from('drivers').update({ status: 'on_duty' }).eq('id', verified.driverId)
  const { error: sheetError } = await supabase.from('trip_sheets').insert({
    booking_id: bookingId,
    driver_id: verified.driverId,
    booking_leg_id: leg_id || null,
    tripsheet_number: finalTripsheetNumber,
    opening_km: opening_km ?? null,
    opening_lat: lat ?? null,
    opening_lng: lng ?? null,
    opening_time: new Date().toISOString(),
    manual_opening_time: manual_opening_time || null,
    trip_opening_date: booking.trip_type === 'outstation' ? todayIST : null,
  })
  if (sheetError) console.error(`[arrive] trip_sheets insert failed booking=${bookingId}:`, sheetError.message)

  return NextResponse.json({
    ok: true,
    gps_tracking_enabled: !!booking.gps_tracking_enabled,
    tripsheet_number: finalTripsheetNumber,
    opening_km: opening_km ?? null,
    manual_opening_time: manual_opening_time || null,
  })
}
