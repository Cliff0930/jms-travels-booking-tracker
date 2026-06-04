import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }
function pad(n: number) { return String(n).padStart(2, '0') }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const driverId = searchParams.get('driver_id')
  const now = new Date()
  const dateFrom = searchParams.get('date_from') || `${now.getFullYear()}-01-01`
  const dateTo   = searchParams.get('date_to')   || fmtDate(now)

  if (!driverId) {
    // List: all drivers with summary metrics
    const [{ data: drivers }, { data: bookings }, { data: advances }, { data: lineItems }] = await Promise.all([
      supabase.from('drivers')
        .select('id, name, phone, vehicle_name, vehicle_number, vehicle_type, commission_percent, bata_rate, driver_type, status, is_active')
        .eq('is_active', true).order('name'),
      supabase.from('bookings')
        .select('id, driver_id, status, pickup_date')
        .not('driver_id', 'is', null)
        .in('status', ['completed', 'cancelled', 'confirmed', 'in_progress'])
        .gte('pickup_date', dateFrom).lte('pickup_date', dateTo),
      supabase.from('driver_advances')
        .select('driver_id, amount, type, status')
        .eq('type', 'advance').eq('status', 'outstanding'),
      supabase.from('invoice_line_items')
        .select('hire_charges, invoice_id')
        .in('invoice_id', (await supabase.from('invoices').select('id, driver_id:invoice_line_items(booking_id)')
          .in('status', ['sent','paid','partially_paid','overdue'])
          .gte('period_from', dateFrom).lte('period_from', dateTo)).data?.map(i => i.id) ?? []),
    ])

    const advanceMap: Record<string, number> = {}
    for (const a of advances ?? []) {
      advanceMap[a.driver_id] = (advanceMap[a.driver_id] ?? 0) + Number(a.amount)
    }

    const list = (drivers ?? []).map(d => {
      const dBookings = (bookings ?? []).filter(b => b.driver_id === d.id)
      const trips   = dBookings.filter(b => b.status === 'completed').length
      const active  = dBookings.filter(b => ['confirmed','in_progress'].includes(b.status)).length
      const advances_outstanding = r2(advanceMap[d.id] ?? 0)
      return {
        id: d.id, name: d.name, phone: d.phone,
        vehicle_name: d.vehicle_name, vehicle_number: d.vehicle_number,
        vehicle_type: d.vehicle_type, commission_percent: d.commission_percent,
        bata_rate: d.bata_rate, driver_type: d.driver_type, status: d.status,
        trips, active, advances_outstanding,
      }
    }).filter(d => d.trips > 0 || d.active > 0 || d.advances_outstanding > 0)
      .sort((a, b) => b.trips - a.trips)

    return NextResponse.json(list)
  }

  // Full scorecard for one driver — split into two fetches so trip_sheets can filter on completed booking IDs
  const [
    { data: driver },
    { data: bookings },
    { data: advances },
    { data: settlements },
  ] = await Promise.all([
    supabase.from('drivers')
      .select('id, name, phone, secondary_phone, vehicle_name, vehicle_number, vehicle_type, commission_percent, bata_rate, driver_type, status, is_active')
      .eq('id', driverId).single(),
    supabase.from('bookings')
      .select('id, booking_ref, status, pickup_date, pickup_time, trip_type, guest_name, pickup_location, drop_location, company:companies!company_id(id, name)')
      .eq('driver_id', driverId)
      .gte('pickup_date', dateFrom).lte('pickup_date', dateTo)
      .order('pickup_date', { ascending: false }),
    supabase.from('driver_advances')
      .select('id, amount, type, status, created_at, notes')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('driver_settlements')
      .select('id, ref_number, period_from, period_to, net_payable, status, paid_at')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const completedBookingIds = (bookings ?? []).filter(b => b.status === 'completed').map(b => b.id)
  const { data: tripSheets } = completedBookingIds.length > 0
    ? await supabase.from('trip_sheets')
        .select('booking_id, bata_driver, toll_amount, parking_amount, permit_amount')
        .in('booking_id', completedBookingIds)
    : { data: [] }

  if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

  const allBookings = bookings ?? []
  const completed   = allBookings.filter(b => b.status === 'completed')
  const trips       = completed.length
  const cancelled   = allBookings.filter(b => b.status === 'cancelled').length
  const active      = allBookings.filter(b => ['confirmed','in_progress'].includes(b.status)).length

  // Get line items for completed bookings to calculate revenue
  let totalHire = 0
  if (completedBookingIds.length > 0) {
    const { data: lis } = await supabase
      .from('invoice_line_items')
      .select('hire_charges')
      .in('booking_id', completedBookingIds)
    totalHire = (lis ?? []).reduce((s, li) => s + Number(li.hire_charges), 0)
  }

  const commissionPct  = Number(driver.commission_percent ?? 20)
  const bataRate       = Number(driver.bata_rate ?? 300)
  const sheetMap       = Object.fromEntries((tripSheets ?? []).map(s => [s.booking_id, s]))

  let totalBata = 0, totalReimbs = 0
  for (const b of completed) {
    const s = sheetMap[b.id]
    if (!s) continue
    const bataCount = Number(s.bata_driver ?? 0)
    const tripBata  = b.trip_type === 'airport' ? 0 : bataCount * bataRate
    const reimbs    = Number(s.toll_amount ?? 0) + Number(s.parking_amount ?? 0) + Number(s.permit_amount ?? 0)
    totalBata   += tripBata
    totalReimbs += reimbs
  }

  const commission     = r2(totalHire * (1 - commissionPct / 100))
  const companyMargin  = r2(totalHire * (commissionPct / 100))

  const advancesOut = r2((advances ?? []).filter(a => a.type === 'advance' && a.status === 'outstanding').reduce((s, a) => s + Number(a.amount), 0))
  const totalEarnings = r2(commission + totalBata + totalReimbs)

  // Monthly volume
  const monthMap: Record<string, number> = {}
  for (const b of completed) {
    const m = (b.pickup_date ?? '').slice(0, 7)
    if (m) monthMap[m] = (monthMap[m] ?? 0) + 1
  }
  const monthlyVolume = Object.entries(monthMap).sort(([a],[b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))

  // Companies served
  const companyMap: Record<string, { name: string; trips: number }> = {}
  for (const b of completed) {
    const c = b.company as { id?: string; name?: string } | null
    if (!c?.id || !c.name) continue
    if (!companyMap[c.id]) companyMap[c.id] = { name: c.name, trips: 0 }
    companyMap[c.id].trips++
  }
  const companiesServed = Object.values(companyMap).sort((a, b) => b.trips - a.trips).slice(0, 6)

  return NextResponse.json({
    driver,
    period: { from: dateFrom, to: dateTo },
    summary: { trips, cancelled, active, totalHire: r2(totalHire), commission, companyMargin, bata: r2(totalBata), reimbs: r2(totalReimbs), totalEarnings, advancesOut, commissionPct },
    monthlyVolume,
    companiesServed,
    advances: advances ?? [],
    settlements: settlements ?? [],
    recentBookings: allBookings.slice(0, 15),
  })
}
