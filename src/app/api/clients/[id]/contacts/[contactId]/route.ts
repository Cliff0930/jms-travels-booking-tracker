import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params
  const supabase = createAdminClient()
  const body = await request.json()
  const { value, contact_type } = body
  if (!value || !contact_type) return NextResponse.json({ error: 'value and contact_type required' }, { status: 400 })
  const { data, error } = await supabase
    .from('client_contacts')
    .update({ value: value.trim(), contact_type })
    .eq('id', contactId)
    .eq('client_id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', contactId)
    .eq('client_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
