import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; legId: string }> }) {
  const { legId } = await params
  const supabase = createAdminClient()
  const { driver_id, leg_status } = await request.json()

  const updates: Record<string, unknown> = {}
  if (driver_id !== undefined) updates.driver_id = driver_id
  if (leg_status !== undefined) updates.leg_status = leg_status

  const { data, error } = await supabase
    .from('booking_legs')
    .update(updates)
    .eq('id', legId)
    .select('*, driver:drivers(id, name, phone, vehicle_name, vehicle_number)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (driver_id) {
    await supabase.from('drivers').update({ status: 'on_duty' }).eq('id', driver_id)
  }

  return NextResponse.json(data)
}
