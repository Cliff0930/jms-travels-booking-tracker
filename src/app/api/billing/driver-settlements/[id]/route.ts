import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: settlement, error }, { data: trips }] = await Promise.all([
    supabase
      .from('driver_settlements')
      .select('*, driver:drivers!driver_id(id, name, vehicle_name, vehicle_number, phone)')
      .eq('id', id)
      .single(),
    supabase
      .from('driver_settlement_trips')
      .select('*')
      .eq('settlement_id', id)
      .order('trip_date', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ ...settlement, trips: trips ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const supabase = createAdminClient()

  if (body.status === 'paid' && !body.paid_at) body.paid_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('driver_settlements')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-settle outstanding advances (FIFO) when settlement is marked paid
  if (body.status === 'paid' && Number(data.advance_principal_deduction) > 0) {
    const { data: advances } = await supabase
      .from('driver_advances')
      .select('id, amount, type, payment_mode')
      .eq('driver_id', data.driver_id)
      .eq('status', 'outstanding')
      .order('created_at', { ascending: true })

    let remaining = Number(data.advance_principal_deduction)
    const periodLabel = `${data.period_from} to ${data.period_to}`

    for (const adv of advances ?? []) {
      if (remaining <= 0) break
      const advAmt = Number(adv.amount)
      if (remaining >= advAmt) {
        await supabase.from('driver_advances').update({
          status: 'settled',
          settled_at: data.paid_at,
          settled_via: 'Settlement deduction',
          settlement_id: id,
          note: `Auto-settled via statement ${periodLabel}`,
        }).eq('id', adv.id)
        remaining -= advAmt
      } else {
        // Partial: settle the consumed portion, create new row for the remainder
        await supabase.from('driver_advances').update({
          amount: remaining,
          status: 'settled',
          settled_at: data.paid_at,
          settled_via: 'Settlement deduction',
          settlement_id: id,
          note: `Partially settled via statement ${periodLabel}`,
        }).eq('id', adv.id)
        await supabase.from('driver_advances').insert({
          driver_id: data.driver_id,
          type: adv.type,
          amount: advAmt - remaining,
          payment_mode: adv.payment_mode,
          status: 'outstanding',
          note: `Remainder after statement ${periodLabel}`,
        })
        remaining = 0
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { error } = await supabase.from('driver_settlements').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
