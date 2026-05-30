import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7) // 'YYYY-MM'
}

function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const year = searchParams.get('year') ?? new Date().getFullYear().toString()
  const supabase = createAdminClient()

  const from = `${year}-01-01`
  const to = `${year}-12-31`

  const [
    { data: invoices },
    { data: payments },
    { data: settlements },
    { data: advances },
  ] = await Promise.all([
    supabase.from('invoices').select('period_from, grand_total, amount_paid, status').gte('period_from', from).lte('period_from', to),
    supabase.from('billing_payments').select('payment_date, amount').gte('payment_date', from).lte('payment_date', to),
    supabase.from('driver_settlements').select('paid_at, net_payable').eq('status', 'paid').gte('paid_at', from).lte('paid_at', to + 'T23:59:59'),
    supabase.from('driver_advances').select('created_at, amount, type').eq('type', 'advance').gte('created_at', from).lte('created_at', to + 'T23:59:59'),
  ])

  // Aggregate by month
  const months: Record<string, { billed: number; collected: number; driver_payouts: number; advances_given: number }> = {}

  const ensure = (k: string) => {
    if (!months[k]) months[k] = { billed: 0, collected: 0, driver_payouts: 0, advances_given: 0 }
  }

  for (const inv of invoices ?? []) {
    const k = monthKey(inv.period_from)
    ensure(k)
    months[k].billed += Number(inv.grand_total)
  }
  for (const p of payments ?? []) {
    const k = monthKey(p.payment_date)
    ensure(k)
    months[k].collected += Number(p.amount)
  }
  for (const s of settlements ?? []) {
    if (!s.paid_at) continue
    const k = monthKey(s.paid_at)
    ensure(k)
    months[k].driver_payouts += Number(s.net_payable)
  }
  for (const a of advances ?? []) {
    const k = monthKey(a.created_at)
    ensure(k)
    months[k].advances_given += Number(a.amount)
  }

  // Fill all 12 months even if empty
  const rows = Array.from({ length: 12 }, (_, i) => {
    const k = `${year}-${String(i + 1).padStart(2, '0')}`
    const m = months[k] ?? { billed: 0, collected: 0, driver_payouts: 0, advances_given: 0 }
    return {
      month: k,
      label: monthLabel(k),
      billed: r2(m.billed),
      collected: r2(m.collected),
      driver_payouts: r2(m.driver_payouts),
      advances_given: r2(m.advances_given),
      gross_margin: r2(m.billed - m.driver_payouts),
    }
  })

  const totals = rows.reduce((acc, r) => ({
    billed: acc.billed + r.billed,
    collected: acc.collected + r.collected,
    driver_payouts: acc.driver_payouts + r.driver_payouts,
    advances_given: acc.advances_given + r.advances_given,
    gross_margin: acc.gross_margin + r.gross_margin,
  }), { billed: 0, collected: 0, driver_payouts: 0, advances_given: 0, gross_margin: 0 })

  return NextResponse.json({ year, rows, totals })
}
