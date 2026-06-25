import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// PATCH: link booking to a group (body: { group_id }) or unlink (body: { group_id: null })
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { group_id } = await req.json()
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('bookings')
    .update({ trip_group_id: group_id ?? null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, booking_ref, trip_group_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
