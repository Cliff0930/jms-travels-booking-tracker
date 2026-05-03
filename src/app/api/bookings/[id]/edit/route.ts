import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

const FIELD_LABELS: Record<string, string> = {
  pickup_location: 'Pickup Location',
  drop_location: 'Drop Location',
  pickup_date: 'Pickup Date',
  pickup_time: 'Pickup Time',
  pax_count: 'Passengers',
  vehicle_type: 'Vehicle Type',
  trip_type: 'Trip Type',
  service_type: 'Service Type',
  total_days: 'Total Days',
  special_instructions: 'Special Instructions',
  guest_name: 'Guest Name',
  guest_phone: 'Guest Phone',
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  let changedByName = 'operator'
  if (user) {
    const { data: profile } = await admin
      .from('user_profiles')
      .select('name, email')
      .eq('id', user.id)
      .single()
    changedByName = profile?.name || profile?.email || user.email || 'operator'
  }

  const { changes, reason } = await request.json()

  if (!reason?.trim()) {
    return NextResponse.json({ error: 'Reason is required' }, { status: 400 })
  }

  const { data: current } = await admin.from('bookings').select('*').eq('id', id).single()
  if (!current) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Compute diff — only fields that actually changed
  const diff: Array<{ field: string; label: string; old_value: string; new_value: string }> = []
  for (const [field, newValue] of Object.entries(changes)) {
    const oldValue = current[field as keyof typeof current]
    const oldStr = oldValue != null ? String(oldValue) : ''
    const newStr = newValue != null ? String(newValue) : ''
    if (oldStr !== newStr) {
      diff.push({
        field,
        label: FIELD_LABELS[field] ?? field,
        old_value: oldStr || '—',
        new_value: newStr || '—',
      })
    }
  }

  if (diff.length === 0) {
    return NextResponse.json({ error: 'No changes detected' }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('bookings')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('booking_edit_logs').insert({
    booking_id: id,
    changed_by: changedByName,
    changed_by_id: user?.id ?? null,
    reason: reason.trim(),
    changes: diff,
  })

  return NextResponse.json(updated)
}
