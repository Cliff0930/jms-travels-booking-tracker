import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createAdminClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const vehicle_type = searchParams.get('vehicle_type')
  const active_only = searchParams.get('active_only') !== 'false'

  let query = supabase
    .from('drivers')
    .select('*')
    .order('name')

  if (active_only) query = query.eq('is_active', true)
  if (status) query = query.eq('status', status)
  if (vehicle_type) query = query.eq('vehicle_type', vehicle_type)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createAdminClient()
  const body = await request.json()
  const { data, error } = await supabase.from('drivers').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
