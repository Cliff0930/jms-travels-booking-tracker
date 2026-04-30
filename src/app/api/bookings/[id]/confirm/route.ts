import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('status, total_days, pickup_date')
    .eq('id', id)
    .single()
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'confirmed',
    changed_by: 'operator',
  })

  // Auto-create legs for multi-day bookings
  if (booking.total_days > 1 && booking.pickup_date) {
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
    await supabase
      .from('booking_legs')
      .upsert(legs, { onConflict: 'booking_id,day_number' })
  }

  return NextResponse.json(data)
}
