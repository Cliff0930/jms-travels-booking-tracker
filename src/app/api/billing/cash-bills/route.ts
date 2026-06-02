import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

async function nextBillNumber(supabase: ReturnType<typeof createAdminClient>): Promise<string> {
  const year = new Date().getFullYear()
  const fy = new Date().getMonth() >= 3 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`
  const key = `cash_bill_last_seq_${fy}`
  const { data: setting } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  const nextSeq = (parseInt(setting?.value ?? '0') + 1)
  await supabase.from('app_settings').upsert({ key, value: String(nextSeq) }, { onConflict: 'key' })
  return `CASH-${fy}-${String(nextSeq).padStart(4, '0')}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const status   = searchParams.get('status')
  const supabase = createAdminClient()

  let q = supabase
    .from('cash_bills')
    .select('*, client:clients!client_id(name, prefix, designation, primary_phone)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (clientId) q = q.eq('client_id', clientId)
  if (status)   q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json() as {
    client_id?: string | null
    client_name: string
    period_from: string; period_to: string
    subtotal: number; total: number
    notes?: string
    payment_mode?: string
    line_items: Record<string, unknown>[]
    created_by?: string
  }

  const bill_number = await nextBillNumber(supabase)

  const { data: bill, error: billErr } = await supabase
    .from('cash_bills')
    .insert({
      bill_number,
      client_id: body.client_id ?? null,
      client_name: body.client_name,
      period_from: body.period_from,
      period_to: body.period_to,
      subtotal: body.subtotal,
      total: body.total,
      notes: body.notes ?? null,
      payment_mode: body.payment_mode ?? 'cash',
      status: 'draft',
    })
    .select()
    .single()

  if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 })

  if (body.line_items?.length) {
    const items = body.line_items.map((li, i) => ({ ...li, cash_bill_id: bill.id, sort_order: i }))
    const { error: liErr } = await supabase.from('cash_bill_line_items').insert(items)
    if (liErr) {
      await supabase.from('cash_bills').delete().eq('id', bill.id)
      return NextResponse.json({ error: `Line items failed: ${liErr.message}` }, { status: 500 })
    }
  }

  return NextResponse.json(bill)
}
