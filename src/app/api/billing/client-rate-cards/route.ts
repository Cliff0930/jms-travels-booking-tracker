import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const supabase = createAdminClient()
  let q = supabase.from('client_rate_cards').select('*, company:companies!company_id(name)').eq('is_active', true).order('vehicle_type')
  if (companyId) q = q.eq('company_id', companyId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()
  const { data, error } = await supabase.from('client_rate_cards').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
