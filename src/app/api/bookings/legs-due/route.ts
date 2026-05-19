import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const { data: legs, error } = await supabase
    .from('booking_legs')
    .select('*, driver:drivers(id, name, phone, vehicle_name, vehicle_number)')
    .eq('leg_date', date)
    .in('leg_status', ['upcoming', 'in_progress'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!legs || legs.length === 0) return NextResponse.json([])

  const bookingIds = [...new Set(legs.map((l: { booking_id: string }) => l.booking_id))]

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_ref, status, trip_type, total_days, pickup_location, drop_location, pickup_date, pickup_time, guest_name, guest_phone, client:clients!client_id(id, name, primary_phone), company:companies(id, name), driver:drivers(id, name, phone, vehicle_name, vehicle_number)')
    .in('id', bookingIds)
    .in('status', ['confirmed', 'in_progress'])

  const bookingMap = new Map((bookings ?? []).map((b: { id: string }) => [b.id, b]))

  type LegItem = { leg: any; booking: any }
  const result: LegItem[] = legs
    .map((leg: any) => ({ leg, booking: bookingMap.get(leg.booking_id) }))
    .filter((item: LegItem) => !!item.booking)
    .sort((a: LegItem, b: LegItem) => {
      const aUrgent = !a.leg.link_sent_at ? 0 : 1
      const bUrgent = !b.leg.link_sent_at ? 0 : 1
      if (aUrgent !== bUrgent) return aUrgent - bUrgent
      return a.leg.day_number - b.leg.day_number
    })

  return NextResponse.json(result)
}
