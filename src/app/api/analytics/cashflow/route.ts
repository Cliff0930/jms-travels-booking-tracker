import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

// Returns ISO week label like "W23 Jun 2–8"
function weekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const startLabel = weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const endLabel   = weekEnd.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return `${startLabel} – ${endLabel}`
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''))
  // Monday-based week start
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return fmtDate(monday)
}

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const now = new Date()
  const defaultFrom = (() => {
    const d = new Date(now)
    d.setDate(d.getDate() - 90)
    return fmtDate(d)
  })()
  const defaultTo = fmtDate(now)

  const dateFrom = searchParams.get('date_from') || defaultFrom
  const dateTo   = searchParams.get('date_to')   || defaultTo

  const [
    { data: payments },
    { data: settlements },
    { data: advances },
  ] = await Promise.all([
    // Money IN: invoice payments received
    supabase.from('billing_payments')
      .select('payment_date, amount, tds_amount')
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo),

    // Money OUT: driver settlements paid
    supabase.from('driver_settlements')
      .select('paid_at, net_payable')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .gte('paid_at', dateFrom)
      .lte('paid_at', dateTo + 'T23:59:59'),

    // Money OUT: advances disbursed
    supabase.from('driver_advances')
      .select('created_at, amount, type')
      .eq('type', 'advance')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59'),
  ])

  // Build all week buckets between dateFrom and dateTo
  const weekMap: Record<string, { label: string; inflow: number; settlements: number; advances: number }> = {}

  function ensureWeek(key: string) {
    if (!weekMap[key]) {
      const d = new Date(key + 'T00:00:00')
      weekMap[key] = { label: weekLabel(d), inflow: 0, settlements: 0, advances: 0 }
    }
  }

  // Seed all weeks in range so the chart has no gaps
  const cursor = new Date(dateFrom + 'T00:00:00')
  const end    = new Date(dateTo   + 'T00:00:00')
  // Move cursor to Monday
  const dayOfWeek = cursor.getDay() === 0 ? 6 : cursor.getDay() - 1
  cursor.setDate(cursor.getDate() - dayOfWeek)
  while (cursor <= end) {
    ensureWeek(fmtDate(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }

  for (const p of payments ?? []) {
    const k = weekKey(p.payment_date)
    ensureWeek(k)
    weekMap[k].inflow += Number(p.amount) + Number(p.tds_amount ?? 0)
  }
  for (const s of settlements ?? []) {
    if (!s.paid_at) continue
    const k = weekKey(s.paid_at)
    ensureWeek(k)
    weekMap[k].settlements += Number(s.net_payable)
  }
  for (const a of advances ?? []) {
    const k = weekKey(a.created_at)
    ensureWeek(k)
    weekMap[k].advances += Number(a.amount)
  }

  const weeks = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, v]) => ({
      weekStart,
      label: v.label,
      inflow: r2(v.inflow),
      outflow: r2(v.settlements + v.advances),
      settlements: r2(v.settlements),
      advances: r2(v.advances),
      net: r2(v.inflow - v.settlements - v.advances),
    }))

  const totals = weeks.reduce(
    (acc, w) => ({
      inflow:      r2(acc.inflow      + w.inflow),
      outflow:     r2(acc.outflow     + w.outflow),
      settlements: r2(acc.settlements + w.settlements),
      advances:    r2(acc.advances    + w.advances),
      net:         r2(acc.net         + w.net),
    }),
    { inflow: 0, outflow: 0, settlements: 0, advances: 0, net: 0 }
  )

  return NextResponse.json({ period: { from: dateFrom, to: dateTo }, weeks, totals })
}
