import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const VALID = ['confirmed', 'in_progress', 'completed', 'driver_assigned'] as const
type OverrideStatus = typeof VALID[number]

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status } = await request.json() as { status: string }

  if (!VALID.includes(status as OverrideStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, status, driver_id')
    .eq('id', id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'driver_assigned') {
    updatePayload.cancelled_reason = null
    updatePayload.cancelled_at = null
  }

  await supabase.from('bookings').update(updatePayload).eq('id', id)

  await supabase.from('booking_status_history').insert({
    booking_id: id,
    old_status: booking.status,
    new_status: status,
    changed_by: 'operator',
  })

  if (booking.driver_id) {
    const driverStatus = status === 'completed' ? 'available' : 'on_duty'
    await supabase.from('drivers').update({ status: driverStatus }).eq('id', booking.driver_id)
  }

  return NextResponse.json({ ok: true })
}
