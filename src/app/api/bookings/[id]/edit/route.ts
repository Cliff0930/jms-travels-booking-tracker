import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { findOrCreateGuestClient } from '@/lib/utils/guest-client'

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

  const { changes, reason, guest_name_action } = await request.json() as {
    changes: Record<string, unknown>
    reason: string
    guest_name_action?: 'update' | 'new'
  }

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

  // Auto-save guest to client directory when guest_name is present and not yet linked (or changed)
  const guestNameChanged = diff.some(d => d.field === 'guest_name')
  const guestName = (changes.guest_name as string | null | undefined) ?? null
  const guestPhone = (changes.guest_phone as string | null | undefined)
    ?? ((current as Record<string, unknown>).guest_phone as string | null)
    ?? null
  const existingGuestClientId = (current as Record<string, unknown>).guest_client_id as string | null ?? null
  let companyId = (current as Record<string, unknown>).company_id as string | null ?? null
  if (!companyId) {
    const clientId = (current as Record<string, unknown>).client_id as string | null ?? null
    if (clientId) {
      const { data: clientRow } = await admin.from('clients').select('company_id').eq('id', clientId).single()
      companyId = (clientRow as { company_id: string | null } | null)?.company_id ?? null
    }
  }

  // Auto-extend booking legs when total_days increases
  const newTotalDays = typeof changes.total_days === 'number' ? changes.total_days : null
  const prevTotalDays = typeof current.total_days === 'number' ? current.total_days : 1
  if (newTotalDays && newTotalDays > 1 && newTotalDays > prevTotalDays) {
    const baseDate = (changes.pickup_date as string | null | undefined) ?? (current.pickup_date as string | null)
    if (baseDate) {
      const { data: existingLegs } = await admin
        .from('booking_legs')
        .select('day_number')
        .eq('booking_id', id)
      const existingDays = new Set((existingLegs ?? []).map((l: { day_number: number }) => l.day_number))
      const newLegs = Array.from({ length: newTotalDays }, (_, i) => {
        if (existingDays.has(i + 1)) return null
        const d = new Date(baseDate + 'T00:00:00Z')
        d.setUTCDate(d.getUTCDate() + i)
        return { booking_id: id, day_number: i + 1, leg_date: d.toISOString().slice(0, 10), leg_status: 'upcoming' }
      }).filter(Boolean)
      if (newLegs.length > 0) {
        await admin.from('booking_legs').insert(newLegs)
      }
    }
  }

  if (guestName && (guestNameChanged || !existingGuestClientId)) {
    try {
      const isCorrection = existingGuestClientId && guest_name_action === 'update'

      if (isCorrection) {
        // Typo / name correction — update existing guest's profile in place
        await admin.from('clients').update({
          name: guestName,
          ...(guestPhone ? { primary_phone: guestPhone } : {}),
        }).eq('id', existingGuestClientId)
      } else {
        // New guest (or no existing link) — find by phone/name or create
        const guestClientId = await findOrCreateGuestClient(admin, {
          guestName,
          guestPhone,
          companyId,
        })
        if (guestClientId) {
          await admin.from('bookings').update({ guest_client_id: guestClientId }).eq('id', id)
        }
      }
    } catch { /* non-critical */ }
  }

  return NextResponse.json(updated)
}
