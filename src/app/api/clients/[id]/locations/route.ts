import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json()
  const { keyword, address } = body
  if (!keyword || !address) return NextResponse.json({ error: 'keyword and address required' }, { status: 400 })
  const { data, error } = await supabase
    .from('client_locations')
    .insert({ client_id: id, keyword: keyword.trim().toLowerCase(), address: address.trim() })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
