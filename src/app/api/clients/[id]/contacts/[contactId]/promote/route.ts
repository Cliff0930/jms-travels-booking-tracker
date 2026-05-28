import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id: clientId, contactId } = await params
  const supabase = createAdminClient()

  const { data: contact, error: contactErr } = await supabase
    .from('client_contacts').select('*').eq('id', contactId).eq('client_id', clientId).single()
  if (contactErr || !contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const { data: client, error: clientErr } = await supabase
    .from('clients').select('primary_phone, primary_email').eq('id', clientId).single()
  if (clientErr || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const field = contact.contact_type === 'phone' ? 'primary_phone' : 'primary_email'
  const oldPrimary = client[field as 'primary_phone' | 'primary_email']
  const newPrimary = contact.contact_type === 'phone'
    ? (normalizePhone(contact.value) || contact.value)
    : contact.value

  if (oldPrimary && oldPrimary !== newPrimary) {
    const { error: insertErr } = await supabase.from('client_contacts').insert({
      client_id: clientId,
      value: oldPrimary,
      contact_type: contact.contact_type,
      role: 'additional',
    })
    if (insertErr && !insertErr.message.includes('duplicate')) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
  }

  const { error: updateErr } = await supabase.from('clients').update({ [field]: newPrimary }).eq('id', clientId)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { error: deleteErr } = await supabase.from('client_contacts').delete().eq('id', contactId).eq('client_id', clientId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
