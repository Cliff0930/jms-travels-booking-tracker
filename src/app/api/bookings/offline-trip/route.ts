import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()

  const {
    // Booking fields
    client_id, company_id, booking_type,
    guest_name, guest_phone,
    driver_id,
    pickup_location, drop_location,
    pickup_date, pickup_time,
    pax_count, vehicle_type,
    trip_type, service_type, total_days,
    special_instructions,
    // Tripsheet fields
    tripsheet_number,
    opening_km, closing_km,
    manual_opening_time, manual_closing_time,
    toll_amount, parking_amount, permit_amount,
    bata_driver, bata_client,
  } = body

  if (!pickup_location) return NextResponse.json({ error: 'Pickup location is required' }, { status: 400 })
  if (!pickup_date)     return NextResponse.json({ error: 'Trip date is required' }, { status: 400 })

  const normalizedPhone = guest_phone ? normalizePhone(guest_phone) : null

  const flags: string[] = ['offline_trip']
  if (!pickup_location) flags.push('missing_pickup')
  if (!drop_location)   flags.push('missing_drop')

  // Create the booking in completed status
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .insert({
      client_id:            client_id    || null,
      company_id:           company_id   || null,
      booking_type:         booking_type || 'company',
      guest_name:           guest_name   || null,
      guest_phone:          normalizedPhone,
      driver_id:            driver_id    || null,
      pickup_location:      pickup_location,
      drop_location:        drop_location || null,
      pickup_date:          pickup_date,
      pickup_time:          pickup_time  || null,
      pax_count:            pax_count    ? Number(pax_count) : null,
      vehicle_type:         vehicle_type || null,
      trip_type:            trip_type    || 'local',
      service_type:         service_type || 'one_way',
      total_days:           total_days   ? Number(total_days) : 1,
      special_instructions: special_instructions || null,
      source:               'manual',
      status:               'completed',
      flags,
    })
    .select()
    .single()

  if (bookingErr || !booking) {
    return NextResponse.json({ error: bookingErr?.message ?? 'Failed to create booking' }, { status: 500 })
  }

  // Record status history
  await supabase.from('booking_status_history').insert({
    booking_id: booking.id,
    new_status: 'completed',
    changed_by: 'system',
  }).then(() => {}, () => {})

  // Create the tripsheet
  const sheetPayload: Record<string, unknown> = {
    booking_id: booking.id,
  }
  if (tripsheet_number !== undefined && tripsheet_number !== '')   sheetPayload.tripsheet_number    = tripsheet_number
  if (opening_km       !== undefined && opening_km       !== '')   sheetPayload.opening_km           = Number(opening_km)
  if (closing_km       !== undefined && closing_km       !== '')   sheetPayload.closing_km           = Number(closing_km)
  if (manual_opening_time !== undefined && manual_opening_time !== '') sheetPayload.manual_opening_time = manual_opening_time
  if (manual_closing_time !== undefined && manual_closing_time !== '') sheetPayload.manual_closing_time = manual_closing_time
  if (toll_amount      !== undefined && toll_amount      !== '')   sheetPayload.toll_amount           = Number(toll_amount)
  if (parking_amount   !== undefined && parking_amount   !== '')   sheetPayload.parking_amount        = Number(parking_amount)
  if (permit_amount    !== undefined && permit_amount    !== '')   sheetPayload.permit_amount         = Number(permit_amount)
  if (bata_driver      !== undefined && bata_driver      !== '')   sheetPayload.bata_driver           = Number(bata_driver)
  if (bata_client      !== undefined && bata_client      !== '')   sheetPayload.bata_client           = Number(bata_client)

  const { error: sheetErr } = await supabase.from('trip_sheets').insert(sheetPayload)
  if (sheetErr) {
    // Booking was created; log the sheet failure but don't roll back
    console.error('[offline-trip] tripsheet insert failed:', sheetErr.message)
  }

  return NextResponse.json({ id: booking.id, booking_ref: booking.booking_ref }, { status: 201 })
}
