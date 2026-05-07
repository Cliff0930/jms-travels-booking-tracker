import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json()
  const { value, contact_type, role = 'additional' } = body
  if (!value || !contact_type) return NextResponse.json({ error: 'value and contact_type required' }, { status: 400 })
  const { data, error } = await supabase
    .from('client_contacts')
    .insert({ client_id: id, value, contact_type, role })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
