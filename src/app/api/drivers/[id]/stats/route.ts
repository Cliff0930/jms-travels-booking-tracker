import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const [totalRes, monthRes, recentRes, currentRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', id)
      .eq('status', 'completed'),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', id)
      .eq('status', 'completed')
      .gte('pickup_date', monthStart),
    supabase
      .from('bookings')
      .select('booking_ref, pickup_date, pickup_location, drop_location, trip_type')
      .eq('driver_id', id)
      .eq('status', 'completed')
      .order('pickup_date', { ascending: false })
      .limit(5),
    supabase
      .from('bookings')
      .select('booking_ref, pickup_date, pickup_time, pickup_location, drop_location, trip_type, status')
      .eq('driver_id', id)
      .in('status', ['confirmed', 'in_progress'])
      .order('pickup_date', { ascending: true })
      .limit(1),
  ])

  return NextResponse.json({
    total_trips: totalRes.count ?? 0,
    this_month_trips: monthRes.count ?? 0,
    recent_trips: recentRes.data ?? [],
    current_booking: currentRes.data?.[0] ?? null,
  })
}
