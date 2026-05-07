import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { merge_from_id } = await request.json()

  if (!merge_from_id || merge_from_id === id) {
    return NextResponse.json({ error: 'Invalid merge_from_id' }, { status: 400 })
  }

  const [{ data: primary }, { data: duplicate }] = await Promise.all([
    supabase.from('companies').select('*').eq('id', id).single(),
    supabase.from('companies').select('*').eq('id', merge_from_id).single(),
  ])

  if (!primary || !duplicate) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  // Move clients, guests, and bookings
  await Promise.all([
    supabase.from('clients').update({ company_id: id }).eq('company_id', merge_from_id),
    supabase.from('clients').update({ guest_of_company_id: id }).eq('guest_of_company_id', merge_from_id),
    supabase.from('bookings').update({ company_id: id }).eq('company_id', merge_from_id),
  ])

  // Merge array fields — combine and deduplicate
  function mergeArr(a: string[] | null, b: string[] | null): string[] {
    return [...new Set([...(a || []), ...(b || [])])]
  }

  const updates: Partial<typeof primary> = {
    aliases: mergeArr(primary.aliases, duplicate.aliases),
    email_domains: mergeArr(primary.email_domains, duplicate.email_domains),
    approver_emails: mergeArr(primary.approver_emails, duplicate.approver_emails),
    approver_whatsapp: mergeArr(primary.approver_whatsapp, duplicate.approver_whatsapp),
  }

  await supabase.from('companies').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)

  // Delete duplicate
  await supabase.from('companies').delete().eq('id', merge_from_id)

  return NextResponse.json({ ok: true })
}
