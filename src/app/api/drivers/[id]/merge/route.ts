import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await params
  const { target_driver_id: targetId } = await request.json()

  if (!targetId) return NextResponse.json({ error: 'target_driver_id is required' }, { status: 400 })
  if (sourceId === targetId) return NextResponse.json({ error: 'Source and target must be different drivers' }, { status: 400 })

  const supabase = createAdminClient()

  const [{ data: source }, { data: target }] = await Promise.all([
    supabase.from('drivers').select('id, name').eq('id', sourceId).single(),
    supabase.from('drivers').select('id, name').eq('id', targetId).single(),
  ])
  if (!source) return NextResponse.json({ error: 'Source driver not found' }, { status: 404 })
  if (!target) return NextResponse.json({ error: 'Target driver not found' }, { status: 404 })

  await Promise.all([
    supabase.from('bookings').update({ driver_id: targetId }).eq('driver_id', sourceId),
    supabase.from('booking_legs').update({ driver_id: targetId }).eq('driver_id', sourceId),
    supabase.from('trip_sheets').update({ driver_id: targetId }).eq('driver_id', sourceId),
    supabase.from('driver_advances').update({ driver_id: targetId }).eq('driver_id', sourceId),
    supabase.from('message_logs').update({ driver_id: targetId }).eq('driver_id', sourceId),
    supabase.from('driver_substitute_logs').update({ original_driver_id: targetId }).eq('original_driver_id', sourceId),
    supabase.from('driver_substitute_logs').update({ new_driver_id: targetId }).eq('new_driver_id', sourceId),
  ])

  await supabase.from('drivers').update({ is_active: false, status: 'off_duty' }).eq('id', sourceId)

  return NextResponse.json({ ok: true, merged_into: target.name })
}
