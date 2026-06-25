import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  const supabase = createAdminClient()

  const [groupRes, bookingsRes] = await Promise.all([
    supabase.from('trip_groups').select('id, label, created_at').eq('id', groupId).single(),
    supabase
      .from('bookings')
      .select('id, booking_ref, pickup_date, trip_type, status, driver_id, guest_name, pickup_location, drop_location, driver:drivers(name, vehicle_name, vehicle_number)')
      .eq('trip_group_id', groupId)
      .order('pickup_date', { ascending: true }),
  ])

  if (groupRes.error) return NextResponse.json({ error: groupRes.error.message }, { status: 404 })
  return NextResponse.json({ ...groupRes.data, bookings: bookingsRes.data ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  const { label } = await req.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('trip_groups')
    .update({ label: label.trim() })
    .eq('id', groupId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  const supabase = createAdminClient()

  // Detach all bookings first
  await supabase.from('bookings').update({ trip_group_id: null }).eq('trip_group_id', groupId)

  const { error } = await supabase.from('trip_groups').delete().eq('id', groupId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
