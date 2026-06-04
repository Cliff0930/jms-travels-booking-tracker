import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

function prevPeriod(from: string, to: string): { from: string; to: string } {
  const f = new Date(from), t = new Date(to)
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
  const pf = new Date(f); pf.setDate(pf.getDate() - days)
  const pt = new Date(f); pt.setDate(pt.getDate() - 1)
  return { from: fmtDate(pf), to: fmtDate(pt) }
}

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const now = new Date()
  const defaultFrom = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`
  const defaultTo   = fmtDate(now)

  const dateFrom = searchParams.get('date_from') || defaultFrom
  const dateTo   = searchParams.get('date_to')   || defaultTo
  const prev     = prevPeriod(dateFrom, dateTo)

  // ── Parallel fetches ──────────────────────────────────────────────────────
  const [
    { data: invoices },
    { data: prevInvoices },
    { data: payments },
    { data: prevPayments },
    { data: bookings },
    { data: prevBookings },
    { data: lineItems },
    { data: outstanding },
  ] = await Promise.all([
    // Current invoices
    supabase.from('invoices')
      .select('id, grand_total, amount_paid, balance_due, status, company_id, company:companies!company_id(id, name)')
      .in('status', ['sent','paid','partially_paid','overdue'])
      .gte('period_from', dateFrom).lte('period_from', dateTo),

    // Previous period invoices
    supabase.from('invoices')
      .select('grand_total, amount_paid, balance_due')
      .in('status', ['sent','paid','partially_paid','overdue'])
      .gte('period_from', prev.from).lte('period_from', prev.to),

    // Current payments
    supabase.from('billing_payments')
      .select('amount, invoice_id')
      .gte('payment_date', dateFrom).lte('payment_date', dateTo),

    // Previous payments
    supabase.from('billing_payments')
      .select('amount')
      .gte('payment_date', prev.from).lte('payment_date', prev.to),

    // Current completed bookings
    supabase.from('bookings')
      .select('id, pickup_date, status, driver_id, company_id, company:companies!company_id(name), driver:drivers!driver_id(id, name, commission_percent, bata_rate)')
      .in('status', ['completed', 'cancelled'])
      .gte('pickup_date', dateFrom).lte('pickup_date', dateTo),

    // Previous completed/cancelled bookings (just counts)
    supabase.from('bookings')
      .select('id, status')
      .in('status', ['completed', 'cancelled'])
      .gte('pickup_date', prev.from).lte('pickup_date', prev.to),

    // Invoice line items for margin calc (current period invoices)
    supabase.from('invoice_line_items')
      .select('invoice_id, hire_charges, line_total, trip_type')
      .in('invoice_id', (await supabase.from('invoices').select('id')
        .in('status', ['sent','paid','partially_paid','overdue'])
        .gte('period_from', dateFrom).lte('period_from', dateTo)).data?.map(i => i.id) ?? []),

    // Outstanding invoices (top 10)
    supabase.from('invoices')
      .select('id, invoice_number, balance_due, due_date, status, grand_total, period_from, company:companies!company_id(name)')
      .in('status', ['sent','partially_paid','overdue'])
      .gt('balance_due', 0)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
  ])

  // ── Summary stats ─────────────────────────────────────────────────────────
  const billed      = r2((invoices ?? []).reduce((s, i) => s + Number(i.grand_total), 0))
  const collected   = r2((payments  ?? []).reduce((s, p) => s + Number(p.amount),     0))
  const outstanding_total = r2((invoices ?? []).reduce((s, i) => s + Number(i.balance_due), 0))
  const trips       = (bookings ?? []).filter(b => b.status === 'completed').length
  const cancels     = (bookings ?? []).filter(b => b.status === 'cancelled').length

  const prevBilled    = r2((prevInvoices ?? []).reduce((s, i) => s + Number(i.grand_total), 0))
  const prevCollected = r2((prevPayments  ?? []).reduce((s, p) => s + Number(p.amount),     0))
  const prevTrips     = (prevBookings ?? []).filter(b => b.status === 'completed').length
  const prevCancels   = (prevBookings ?? []).filter(b => b.status === 'cancelled').length

  // Margin from line items
  const totalHire   = (lineItems ?? []).reduce((s, li) => s + Number(li.hire_charges), 0)
  const avgMarginPct = billed > 0 ? r2(((billed - (billed * 0.78)) / billed) * 100) : 0 // rough: assume ~22% avg

  // ── Revenue by company ────────────────────────────────────────────────────
  const companyMap: Record<string, { name: string; billed: number; collected: number; balance: number; trips: number }> = {}
  for (const inv of invoices ?? []) {
    const cid = inv.company_id ?? 'unknown'
    const cname = (inv.company as { name?: string } | null)?.name ?? 'Walk-in'
    if (!companyMap[cid]) companyMap[cid] = { name: cname, billed: 0, collected: 0, balance: 0, trips: 0 }
    companyMap[cid].billed  += Number(inv.grand_total)
    companyMap[cid].balance += Number(inv.balance_due)
  }
  for (const p of payments ?? []) {
    const inv = (invoices ?? []).find(i => i.id === p.invoice_id)
    if (inv?.company_id && companyMap[inv.company_id]) {
      companyMap[inv.company_id].collected += Number(p.amount)
    }
  }
  for (const b of (bookings ?? []).filter(b => b.status === 'completed')) {
    const cid = b.company_id ?? 'unknown'
    if (companyMap[cid]) companyMap[cid].trips++
  }
  const byCompany = Object.values(companyMap)
    .sort((a, b) => b.billed - a.billed)
    .slice(0, 8)
    .map(c => ({ ...c, billed: r2(c.billed), collected: r2(c.collected), balance: r2(c.balance) }))

  // ── Driver performance ────────────────────────────────────────────────────
  const driverMap: Record<string, { name: string; trips: number; commission_pct: number; bata_rate: number }> = {}
  for (const b of (bookings ?? []).filter(b => b.status === 'completed')) {
    const d = b.driver as { id?: string; name?: string; commission_percent?: number | null; bata_rate?: number | null } | null
    if (!d?.id || !d.name) continue
    if (!driverMap[d.id]) driverMap[d.id] = { name: d.name, trips: 0, commission_pct: Number(d.commission_percent ?? 20), bata_rate: Number(d.bata_rate ?? 300) }
    driverMap[d.id].trips++
  }
  const driverRevMap: Record<string, number> = {}
  for (const li of lineItems ?? []) {
    const inv = (invoices ?? []).find(i => i.id === li.invoice_id)
    // approximate driver to invoice company
    if (inv?.company_id) driverRevMap[inv.company_id] = (driverRevMap[inv.company_id] ?? 0) + Number(li.hire_charges)
  }
  const byDriver = Object.entries(driverMap)
    .map(([id, d]) => ({
      id, name: d.name, trips: d.trips,
      commission_pct: d.commission_pct,
    }))
    .filter(d => d.trips > 0)
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 8)

  // ── Daily volume ──────────────────────────────────────────────────────────
  const dailyMap: Record<string, number> = {}
  for (const b of (bookings ?? []).filter(b => b.status === 'completed')) {
    const d = b.pickup_date?.slice(0, 10) ?? ''
    if (d) dailyMap[d] = (dailyMap[d] ?? 0) + 1
  }
  const dailyVolume = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return NextResponse.json({
    period: { from: dateFrom, to: dateTo },
    summary: {
      billed, collected, outstanding: outstanding_total, trips, cancels,
      prev: { billed: prevBilled, collected: prevCollected, trips: prevTrips, cancels: prevCancels },
    },
    byCompany,
    byDriver,
    outstanding: (outstanding ?? []).map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      company: (inv.company as { name?: string } | null)?.name ?? '—',
      grand_total: Number(inv.grand_total),
      balance_due: Number(inv.balance_due),
      due_date: inv.due_date,
      status: inv.status,
      period_from: inv.period_from,
    })),
    dailyVolume,
  })
}
