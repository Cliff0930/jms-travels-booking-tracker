import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { merge_from_id } = await request.json()

  if (!merge_from_id || merge_from_id === id) {
    return NextResponse.json({ error: 'Invalid merge_from_id' }, { status: 400 })
  }

  // Fetch both clients with contacts and locations
  const [{ data: primary }, { data: duplicate }] = await Promise.all([
    supabase.from('clients').select('*, contacts:client_contacts(*), locations:client_locations(*)').eq('id', id).single(),
    supabase.from('clients').select('*, contacts:client_contacts(*), locations:client_locations(*)').eq('id', merge_from_id).single(),
  ])

  if (!primary || !duplicate) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  }

  // 1. Move all bookings
  await supabase.from('bookings').update({ client_id: id }).eq('client_id', merge_from_id)

  // 2. Move all message logs
  await supabase.from('message_logs').update({ client_id: id }).eq('client_id', merge_from_id)

  // 3. Promote duplicate's primary phone/email if primary is missing them
  const updates: Record<string, string> = {}
  if (!primary.primary_phone && duplicate.primary_phone) updates.primary_phone = duplicate.primary_phone
  if (!primary.primary_email && duplicate.primary_email) updates.primary_email = duplicate.primary_email
  if (Object.keys(updates).length > 0) {
    await supabase.from('clients').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  }

  // 4. Copy contacts — skip values that already exist on the primary
  const taken = new Set<string>([
    primary.primary_phone,
    primary.primary_email,
    ...(primary.contacts || []).map((c: { value: string }) => c.value),
  ].filter(Boolean))

  const toInsert: Array<{ client_id: string; value: string; contact_type: string; role: string }> = []

  // Add duplicate's primary phone/email as additional contacts (if not promoted above)
  if (duplicate.primary_phone && !taken.has(duplicate.primary_phone)) {
    toInsert.push({ client_id: id, value: duplicate.primary_phone, contact_type: 'phone', role: 'merged' })
    taken.add(duplicate.primary_phone)
  }
  if (duplicate.primary_email && !taken.has(duplicate.primary_email)) {
    toInsert.push({ client_id: id, value: duplicate.primary_email, contact_type: 'email', role: 'merged' })
    taken.add(duplicate.primary_email)
  }
  for (const ct of (duplicate.contacts || [])) {
    if (!taken.has(ct.value)) {
      toInsert.push({ client_id: id, value: ct.value, contact_type: ct.contact_type, role: ct.role || 'merged' })
      taken.add(ct.value)
    }
  }

  if (toInsert.length > 0) await supabase.from('client_contacts').insert(toInsert)

  // 5. Copy locations — upsert by keyword so duplicate labels don't error
  for (const loc of (duplicate.locations || [])) {
    await supabase.from('client_locations')
      .upsert({ client_id: id, keyword: loc.keyword, address: loc.address }, { onConflict: 'client_id,keyword' })
  }

  // 6. Delete the duplicate
  await supabase.from('clients').delete().eq('id', merge_from_id)

  return NextResponse.json({ ok: true })
}
