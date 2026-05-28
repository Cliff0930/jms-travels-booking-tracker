import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/utils/phone'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*, company:companies!company_id(*), guest_of_company:companies!guest_of_company_id(id, name), contacts:client_contacts(*), locations:client_locations(*)')
    .eq('id', id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json()
  if (body.primary_phone) body.primary_phone = normalizePhone(body.primary_phone)
  const { data, error } = await supabase
    .from('clients')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    const msg = error.message.includes('idx_clients_primary_phone_unique')
      ? 'This phone number is already registered to another client'
      : error.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  return NextResponse.json(data)
}
