import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('client_id, pickup_date, guest_name, pickup_location')
    .eq('id', id)
    .single()

  if (!booking?.client_id || !booking?.pickup_date) return NextResponse.json([])

  const { data: sameDay } = await supabase
    .from('bookings')
    .select('id, booking_ref, pickup_date, pickup_time, pickup_location, drop_location, guest_name, guest_phone, status, trip_type')
    .eq('client_id', booking.client_id)
    .eq('pickup_date', booking.pickup_date)
    .not('status', 'in', '("cancelled","completed")')
    .neq('id', id)
    .order('created_at', { ascending: true })

  // Filter in JS: must share guest_name or pickup_location prefix
  const guestFirst = booking.guest_name?.toLowerCase().split(' ')[0] ?? ''
  const locFirst   = booking.pickup_location?.toLowerCase().split(' ').slice(0, 3).join(' ') ?? ''

  const similar = (sameDay ?? []).filter(s => {
    if (guestFirst && s.guest_name?.toLowerCase().includes(guestFirst)) return true
    if (locFirst   && s.pickup_location?.toLowerCase().includes(locFirst)) return true
    return false
  })

  return NextResponse.json(similar)
}
