import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('booking_legs')
    .select('*, driver:drivers(id, name, phone, vehicle_name, vehicle_number, vehicle_type, status)')
    .eq('booking_id', id)
    .order('day_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('pickup_date, total_days')
    .eq('id', id)
    .single()

  if (!booking || !booking.pickup_date || !booking.total_days) {
    return NextResponse.json({ error: 'Booking not found or missing date/days' }, { status: 400 })
  }

  const legs = Array.from({ length: booking.total_days }, (_, i) => {
    const date = new Date(booking.pickup_date)
    date.setDate(date.getDate() + i)
    return {
      booking_id: id,
      day_number: i + 1,
      leg_date: date.toISOString().split('T')[0],
      leg_status: 'upcoming',
    }
  })

  const { data, error } = await supabase
    .from('booking_legs')
    .upsert(legs, { onConflict: 'booking_id,day_number' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
