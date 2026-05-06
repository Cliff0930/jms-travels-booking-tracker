import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { generateBookingRef } from '@/lib/utils/booking-ref'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const date = searchParams.get('date')

  const clientId = searchParams.get('client_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const tripType = searchParams.get('trip_type')
  const source = searchParams.get('source')

  let query = supabase
    .from('bookings')
    .select('*, client:clients!client_id(id, name, primary_phone, primary_email, client_type, is_vip, is_verified), company:companies(id, name), driver:drivers(id, name, phone, vehicle_name, vehicle_number, vehicle_type, status)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (date) query = query.eq('pickup_date', date)
  if (clientId) query = query.eq('client_id', clientId)
  if (dateFrom) query = query.gte('pickup_date', dateFrom)
  if (dateTo) query = query.lte('pickup_date', dateTo)
  if (tripType) query = query.eq('trip_type', tripType)
  if (source) query = query.eq('source', source)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()

  const booking_ref = body.booking_ref || generateBookingRef()
  const flags: string[] = []
  if (!body.pickup_location) flags.push('missing_pickup')
  if (!body.pickup_date) flags.push('missing_date')
  if (!body.pickup_time) flags.push('missing_time')
  if (!body.company_id) flags.push('unknown_company')
  if (!body.drop_location) flags.push('missing_drop')
  if (body.guest_name && !body.client_id) flags.push('guest_booking')

  const { data, error } = await supabase
    .from('bookings')
    .insert({ ...body, booking_ref, flags, status: body.status || 'draft' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: data.id,
    new_status: data.status,
    changed_by: 'system',
  })

  return NextResponse.json(data, { status: 201 })
}
