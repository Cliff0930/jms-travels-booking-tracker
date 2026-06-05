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
    // Single-day tripsheet fields
    tripsheet_number,
    opening_km, closing_km,
    manual_opening_time, manual_closing_time,
    toll_amount, parking_amount, permit_amount,
    bata_driver, bata_client,
    // Multi-day local: array of per-day tripsheets
    day_sheets,
  } = body as {
    client_id?: string; company_id?: string; booking_type?: string
    guest_name?: string; guest_phone?: string; driver_id?: string
    pickup_location: string; drop_location?: string
    pickup_date: string; pickup_time?: string
    pax_count?: string; vehicle_type?: string
    trip_type?: string; service_type?: string; total_days?: string
    special_instructions?: string
    tripsheet_number?: string
    opening_km?: string; closing_km?: string
    manual_opening_time?: string; manual_closing_time?: string
    toll_amount?: string; parking_amount?: string; permit_amount?: string
    bata_driver?: string; bata_client?: string
    day_sheets?: Array<{
      tripsheet_number?: string
      opening_km?: string; closing_km?: string
      manual_opening_time?: string; manual_closing_time?: string
      toll_amount?: string; parking_amount?: string; permit_amount?: string
      bata_driver?: string; bata_client?: string
    }>
  }

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

  // Multi-day local: create booking_legs + per-leg trip_sheets
  if (day_sheets && day_sheets.length > 1 && pickup_date) {
    const legs = day_sheets.map((_, i) => {
      const d = new Date(pickup_date + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() + i)
      return {
        booking_id:  booking.id,
        day_number:  i + 1,
        leg_date:    d.toISOString().slice(0, 10),
        leg_status:  'completed',
        driver_id:   driver_id || null,
      }
    })
    const { data: createdLegs, error: legsErr } = await supabase
      .from('booking_legs')
      .insert(legs)
      .select('id, day_number')
    if (legsErr) console.error('[offline-trip] legs insert failed:', legsErr.message)

    if (createdLegs) {
      const sheetRows = day_sheets.map((s, i) => {
        const leg = createdLegs.find(l => l.day_number === i + 1)
        const row: Record<string, unknown> = {
          booking_id:      booking.id,
          driver_id:       driver_id || null,
          booking_leg_id:  leg?.id ?? null,
        }
        if (s.tripsheet_number)   row.tripsheet_number    = s.tripsheet_number
        if (s.opening_km)         row.opening_km          = Number(s.opening_km)
        if (s.closing_km)         row.closing_km          = Number(s.closing_km)
        if (s.manual_opening_time) row.manual_opening_time = s.manual_opening_time
        if (s.manual_closing_time) row.manual_closing_time = s.manual_closing_time
        if (s.toll_amount)         row.toll_amount         = Number(s.toll_amount)
        if (s.parking_amount)      row.parking_amount      = Number(s.parking_amount)
        if (s.permit_amount)       row.permit_amount       = Number(s.permit_amount)
        if (s.bata_driver)         row.bata_driver         = Number(s.bata_driver)
        if (s.bata_client)         row.bata_client         = Number(s.bata_client)
        return row
      })
      const { error: sheetsErr } = await supabase.from('trip_sheets').insert(sheetRows)
      if (sheetsErr) console.error('[offline-trip] multi-day sheets insert failed:', sheetsErr.message)
    }
  } else {
    // Single-day tripsheet
    const sheetPayload: Record<string, unknown> = { booking_id: booking.id }
    if (tripsheet_number !== undefined && tripsheet_number !== '')       sheetPayload.tripsheet_number    = tripsheet_number
    if (opening_km       !== undefined && opening_km       !== '')       sheetPayload.opening_km          = Number(opening_km)
    if (closing_km       !== undefined && closing_km       !== '')       sheetPayload.closing_km          = Number(closing_km)
    if (manual_opening_time !== undefined && manual_opening_time !== '') sheetPayload.manual_opening_time = manual_opening_time
    if (manual_closing_time !== undefined && manual_closing_time !== '') sheetPayload.manual_closing_time = manual_closing_time
    if (toll_amount      !== undefined && toll_amount      !== '')       sheetPayload.toll_amount         = Number(toll_amount)
    if (parking_amount   !== undefined && parking_amount   !== '')       sheetPayload.parking_amount      = Number(parking_amount)
    if (permit_amount    !== undefined && permit_amount    !== '')       sheetPayload.permit_amount       = Number(permit_amount)
    if (bata_driver      !== undefined && bata_driver      !== '')       sheetPayload.bata_driver         = Number(bata_driver)
    if (bata_client      !== undefined && bata_client      !== '')       sheetPayload.bata_client         = Number(bata_client)

    const { error: sheetErr } = await supabase.from('trip_sheets').insert(sheetPayload)
    if (sheetErr) console.error('[offline-trip] tripsheet insert failed:', sheetErr.message)
  }

  return NextResponse.json({ id: booking.id, booking_ref: booking.booking_ref }, { status: 201 })
}
