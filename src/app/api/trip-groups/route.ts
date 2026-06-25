import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const supabase = createAdminClient()

  const query = supabase
    .from('trip_groups')
    .select('id, label, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (q) query.ilike('label', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const { label } = await req.json()
  if (!label?.trim()) return NextResponse.json({ error: 'Label is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('trip_groups')
    .insert({ label: label.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
