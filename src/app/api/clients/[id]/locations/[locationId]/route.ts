import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; locationId: string }> }) {
  const { id, locationId } = await params
  const supabase = createAdminClient()
  const body = await request.json()
  const { keyword, address } = body
  if (!keyword || !address) return NextResponse.json({ error: 'keyword and address required' }, { status: 400 })
  const { data, error } = await supabase
    .from('client_locations')
    .update({ keyword: keyword.trim().toLowerCase(), address: address.trim() })
    .eq('id', locationId)
    .eq('client_id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; locationId: string }> }) {
  const { id, locationId } = await params
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('client_locations')
    .delete()
    .eq('id', locationId)
    .eq('client_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
