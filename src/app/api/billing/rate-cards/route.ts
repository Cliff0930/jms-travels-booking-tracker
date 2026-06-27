import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const activeOnly = searchParams.get('active') === 'true'

  if (companyId) {
    const { data, error } = await supabase
      .from('client_rate_cards')
      .select('vehicle_type')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('vehicle_type', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (data && data.length > 0) return NextResponse.json(data)
    // Company has no rate cards — fall back to active default rate cards
    const { data: defaults, error: dErr } = await supabase
      .from('rate_cards')
      .select('vehicle_type')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })
    return NextResponse.json(defaults ?? [])
  }

  let q = supabase.from('rate_cards').select('*').order('sort_order', { ascending: true })
  if (activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()
  const { data, error } = await supabase.from('rate_cards').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
