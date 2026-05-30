import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: settlement, error }, { data: trips }] = await Promise.all([
    supabase
      .from('driver_settlements')
      .select('*, driver:drivers!driver_id(id, name, vehicle_name, vehicle_number, phone)')
      .eq('id', id)
      .single(),
    supabase
      .from('driver_settlement_trips')
      .select('*')
      .eq('settlement_id', id)
      .order('trip_date', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ ...settlement, trips: trips ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  if (body.status === 'paid' && !body.paid_at) body.paid_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('driver_settlements')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('driver_settlements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
