import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const client_type = searchParams.get('client_type')

  let query = supabase
    .from('clients')
    .select('*, company:companies(id, name)')
    .order('name')

  if (q) {
    query = query.or(`name.ilike.%${q}%,primary_phone.ilike.%${q}%,primary_email.ilike.%${q}%`)
  }
  if (client_type) query = query.eq('client_type', client_type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()
  const { data, error } = await supabase.from('clients').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
