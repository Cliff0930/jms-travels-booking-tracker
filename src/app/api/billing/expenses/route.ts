import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM
  const supabase = createAdminClient()

  let q = supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })

  if (month) {
    const [y, m] = month.split('-').map(Number)
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
    q = q.gte('date', `${month}-01`).lt('date', nextMonth)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      date: body.date,
      category: body.category,
      description: body.description ?? null,
      amount: body.amount,
      payment_mode: body.payment_mode ?? 'cash',
      vendor: body.vendor ?? null,
      reference: body.reference ?? null,
      booking_id: body.booking_id ?? null,
      created_by: body.created_by ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
