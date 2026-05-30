import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const driverId = searchParams.get('driver_id')
  const status = searchParams.get('status')
  const supabase = createAdminClient()

  let q = supabase
    .from('driver_settlements')
    .select('*, driver:drivers!driver_id(id, name, vehicle_name, vehicle_number)')
    .order('period_from', { ascending: false })
    .limit(200)

  if (driverId) q = q.eq('driver_id', driverId)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json() as {
    driver_id: string; period_from: string; period_to: string
    total_trips: number; hire_earnings: number; bata_earnings: number
    reimbursements: number; salary_amount: number; gross_earnings: number
    advance_principal_deduction: number; advance_interest_deduction: number
    other_deductions: number; net_payable: number
    trip_details: Record<string, unknown>[]
    notes?: string
  }

  const { data: settlement, error: sErr } = await supabase
    .from('driver_settlements')
    .insert({
      driver_id: body.driver_id,
      period_from: body.period_from,
      period_to: body.period_to,
      total_trips: body.total_trips,
      hire_earnings: body.hire_earnings,
      bata_earnings: body.bata_earnings,
      reimbursements: body.reimbursements,
      salary_amount: body.salary_amount,
      gross_earnings: body.gross_earnings,
      advance_principal_deduction: body.advance_principal_deduction,
      advance_interest_deduction: body.advance_interest_deduction,
      other_deductions: body.other_deductions ?? 0,
      net_payable: body.net_payable,
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  if (body.trip_details?.length) {
    const items = body.trip_details.map((t, i) => ({ ...t, settlement_id: settlement.id, sort_order: i }))
    const { error: tErr } = await supabase.from('driver_settlement_trips').insert(items)
    if (tErr) console.error('[driver-settlements] trip insert failed:', tErr.message)
  }

  return NextResponse.json(settlement)
}
