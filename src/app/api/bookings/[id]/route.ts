import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('bookings')
    .select('*, client:clients!client_id(*, contacts:client_contacts(*), locations:client_locations(*)), company:companies(*), driver:drivers(*)')
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
