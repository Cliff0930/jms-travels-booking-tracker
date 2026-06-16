import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('company_id')
  const now = new Date()
  const dateFrom = searchParams.get('date_from') || `${now.getFullYear()}-01-01`
  const dateTo   = searchParams.get('date_to')   || fmtDate(now)

  if (!companyId) {
    // Return list of all companies with key metrics
    const [{ data: companies }, { data: bookings }, { data: invoices }, { data: payments }] = await Promise.all([
      supabase.from('companies').select('id, name, gstin').order('name'),
      supabase.from('bookings').select('id, company_id, status, pickup_date')
        .not('company_id', 'is', null)
        .in('status', ['completed', 'confirmed', 'in_progress', 'cancelled'])
        .gte('pickup_date', dateFrom).lte('pickup_date', dateTo),
      supabase.from('invoices').select('id, company_id, grand_total, balance_due, status')
        .not('company_id', 'is', null)
        .in('status', ['sent', 'paid', 'partially_paid', 'overdue']),
      supabase.from('billing_payments').select('amount, invoice_id'),
    ])

    const invoiceMap: Record<string, { billed: number; outstanding: number }> = {}
    for (const inv of invoices ?? []) {
      const cid = inv.company_id
      if (!invoiceMap[cid]) invoiceMap[cid] = { billed: 0, outstanding: 0 }
      invoiceMap[cid].billed      += Number(inv.grand_total)
      invoiceMap[cid].outstanding += Number(inv.balance_due)
    }

    const list = (companies ?? []).map(c => {
      const cBookings = (bookings ?? []).filter(b => b.company_id === c.id)
      const trips     = cBookings.filter(b => b.status === 'completed').length
      const cancels   = cBookings.filter(b => b.status === 'cancelled').length
      const inv       = invoiceMap[c.id] ?? { billed: 0, outstanding: 0 }
      return {
        id:          c.id,
        name:        c.name,
        gstin:       c.gstin,
        trips,
        cancels,
        billed:      r2(inv.billed),
        outstanding: r2(inv.outstanding),
      }
    }).filter(c => c.trips > 0 || c.billed > 0)
      .sort((a, b) => b.billed - a.billed)

    return NextResponse.json(list)
  }

  // Full scorecard for one company
  const [
    { data: company },
    { data: bookings },
    { data: invoices },
    { data: payments },
    { data: lineItems },
  ] = await Promise.all([
    supabase.from('companies').select('id, name, gstin, address, approval_required, approval_channel').eq('id', companyId).single(),
    supabase.from('bookings')
      .select('id, booking_ref, status, pickup_date, pickup_time, trip_type, guest_name, guest_phone, driver:drivers!driver_id(name), pickup_location, drop_location')
      .eq('company_id', companyId)
      .gte('pickup_date', dateFrom).lte('pickup_date', dateTo)
      .order('pickup_date', { ascending: false }),
    supabase.from('invoices')
      .select('id, invoice_number, grand_total, amount_paid, balance_due, status, due_date, period_from, period_to')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('billing_payments')
      .select('amount, payment_date, payment_mode, reference_number')
      .in('invoice_id', (await supabase.from('invoices').select('id').eq('company_id', companyId)).data?.map(i => i.id) ?? [])
      .order('payment_date', { ascending: false })
      .limit(20),
    supabase.from('invoice_line_items')
      .select('hire_charges, line_total, trip_type')
      .in('invoice_id', (await supabase.from('invoices').select('id').eq('company_id', companyId)
        .in('status', ['sent','paid','partially_paid','overdue'])).data?.map(i => i.id) ?? []),
  ])

  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

  const allBookings = bookings ?? []
  const trips      = allBookings.filter(b => b.status === 'completed').length
  const cancels    = allBookings.filter(b => b.status === 'cancelled').length
  const active     = allBookings.filter(b => ['confirmed','in_progress'].includes(b.status)).length
  const cancelRate = (trips + cancels) > 0 ? Math.round((cancels / (trips + cancels)) * 100) : 0

  const billed      = r2((invoices ?? []).filter(i => ['sent','paid','partially_paid','overdue'].includes(i.status)).reduce((s, i) => s + Number(i.grand_total), 0))
  const outstanding = r2((invoices ?? []).filter(i => ['sent','partially_paid','overdue'].includes(i.status)).reduce((s, i) => s + Number(i.balance_due), 0))
  const collected   = r2((payments  ?? []).reduce((s, p) => s + Number(p.amount), 0))

  // Trip type breakdown
  const tripTypes = allBookings.reduce((acc, b) => {
    acc[b.trip_type] = (acc[b.trip_type] ?? 0) + 1; return acc
  }, {} as Record<string, number>)

  // Monthly volume
  const monthlyMap: Record<string, number> = {}
  for (const b of allBookings.filter(b => b.status === 'completed')) {
    const m = (b.pickup_date ?? '').slice(0, 7)
    if (m) monthlyMap[m] = (monthlyMap[m] ?? 0) + 1
  }
  const monthlyVolume = Object.entries(monthlyMap).sort(([a],[b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))

  // Top travellers
  const guestMap: Record<string, { phone: string | null; trips: number }> = {}
  for (const b of allBookings.filter(b => b.status === 'completed' && b.guest_name)) {
    const name = b.guest_name!
    if (!guestMap[name]) guestMap[name] = { phone: b.guest_phone, trips: 0 }
    guestMap[name].trips++
  }
  const topTravellers = Object.entries(guestMap)
    .map(([name, v]) => ({ name, phone: v.phone, trips: v.trips }))
    .sort((a, b) => b.trips - a.trips)
    .slice(0, 8)

  return NextResponse.json({
    company,
    period: { from: dateFrom, to: dateTo },
    summary: { trips, cancels, active, cancelRate, billed, collected, outstanding },
    tripTypes,
    monthlyVolume,
    topTravellers,
    invoices: (invoices ?? []).slice(0, 12),
    recentBookings: allBookings.slice(0, 15),
  })
}
