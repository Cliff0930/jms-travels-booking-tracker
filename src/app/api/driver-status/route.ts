import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyDriverToken } from '@/lib/utils/driver-token'

export async function POST(request: Request) {
  const { booking_id, status, token } = await request.json()
  const supabase = createAdminClient()

  if (!verifyDriverToken(booking_id, status, token)) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, driver_id, status')
    .eq('id', booking_id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const newBookingStatus = status === 'arrived' ? 'in_progress' : 'completed'
  const driverStatus = status === 'arrived' ? 'on_duty' : 'available'

  await supabase.from('bookings').update({ status: newBookingStatus, updated_at: new Date().toISOString() }).eq('id', booking_id)
  await supabase.from('booking_status_history').insert({
    booking_id,
    old_status: booking.status,
    new_status: newBookingStatus,
    changed_by: 'driver',
  })

  if (booking.driver_id) {
    await supabase.from('drivers').update({ status: driverStatus }).eq('id', booking.driver_id)
  }

  return NextResponse.json({ ok: true })
}
