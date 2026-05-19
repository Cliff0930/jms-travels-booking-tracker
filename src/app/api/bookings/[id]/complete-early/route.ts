import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { reason } = await request.json()

  const { data: booking } = await supabase
    .from('bookings')
    .select('status, total_days')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!['confirmed', 'in_progress'].includes(booking.status)) {
    return NextResponse.json({ error: 'Cannot complete early in this status' }, { status: 400 })
  }

  // Cancel all upcoming legs
  await supabase
    .from('booking_legs')
    .update({ leg_status: 'cancelled' })
    .eq('booking_id', id)
    .eq('leg_status', 'upcoming')

  // Complete any in_progress leg
  await supabase
    .from('booking_legs')
    .update({ leg_status: 'completed' })
    .eq('booking_id', id)
    .eq('leg_status', 'in_progress')

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: 'completed',
    changed_by: reason?.trim() ? `Early completion: ${reason.trim()}` : 'Early completion by operator',
  })

  return NextResponse.json({ ok: true })
}
