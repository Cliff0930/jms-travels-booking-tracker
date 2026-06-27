import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(*, company:companies!company_id(*), contacts:client_contacts(*), locations:client_locations(*)), company:companies!company_id(*), driver:drivers(*)')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json()

  const { data: existing } = await supabase.from('bookings').select('status').eq('id', id).single()

  const { data, error } = await supabase
    .from('bookings')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.status && existing?.status !== body.status) {
    await supabase.from('booking_status_history').insert({
      booking_id: id,
      old_status: existing?.status,
      new_status: body.status,
      changed_by: body.changed_by || 'operator',
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings')
    .select('status, driver_id')
    .eq('id', id)
    .single()

  if (fetchErr || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (booking.status === 'in_progress' || booking.status === 'completed') {
    return NextResponse.json(
      { error: 'Cannot delete a booking that is in progress or completed' },
      { status: 403 }
    )
  }

  if (booking.driver_id) {
    await supabase
      .from('drivers')
      .update({ status: 'available' })
      .eq('id', booking.driver_id)
      .eq('status', 'on_duty')
  }

  // Detach/delete related records before delete (FKs not set to CASCADE/SET NULL in DB)
  await supabase.from('short_links').delete().eq('booking_id', id)
  await supabase.from('conversation_sessions').update({ booking_id: null }).eq('booking_id', id)
  await supabase.from('message_logs').update({ booking_id: null }).eq('booking_id', id)
  await supabase.from('raw_messages').update({ booking_id: null }).eq('booking_id', id)

  const { error: delErr } = await supabase.from('bookings').delete().eq('id', id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
