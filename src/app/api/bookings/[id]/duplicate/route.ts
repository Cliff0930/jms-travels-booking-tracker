import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: src, error: fetchErr } = await supabase
    .from('bookings')
    .select('client_id, company_id, booking_type, guest_name, guest_phone, guest_client_id, pickup_location, drop_location, pickup_location_url, drop_location_url, pickup_date, pickup_time, pax_count, vehicle_type, trip_type, service_type, total_days, special_instructions')
    .eq('id', id)
    .single()

  if (fetchErr || !src) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const flags: string[] = []
  if (!src.pickup_location) flags.push('missing_pickup')
  if (!src.pickup_date) flags.push('missing_date')
  if (!src.pickup_time) flags.push('missing_time')
  if (!src.company_id) flags.push('unknown_company')
  if (!src.drop_location) flags.push('missing_drop')
  if (src.guest_name && !src.client_id) flags.push('guest_booking')

  const { data: newBooking, error: insertErr } = await supabase
    .from('bookings')
    .insert({
      client_id: src.client_id,
      company_id: src.company_id,
      booking_type: src.booking_type,
      guest_name: src.guest_name,
      guest_phone: src.guest_phone,
      guest_client_id: src.guest_client_id,
      pickup_location: src.pickup_location,
      drop_location: src.drop_location,
      pickup_location_url: src.pickup_location_url,
      drop_location_url: src.drop_location_url,
      pickup_date: src.pickup_date,
      pickup_time: src.pickup_time,
      pax_count: src.pax_count,
      vehicle_type: src.vehicle_type,
      trip_type: src.trip_type,
      service_type: src.service_type,
      total_days: src.total_days,
      special_instructions: src.special_instructions,
      source: 'manual',
      status: 'draft',
      flags,
    })
    .select()
    .single()

  if (insertErr || !newBooking) return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: newBooking.id,
    new_status: 'draft',
    changed_by: 'system',
  })

  return NextResponse.json({ id: newBooking.id, booking_ref: newBooking.booking_ref }, { status: 201 })
}
