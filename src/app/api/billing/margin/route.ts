import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const dateFrom  = searchParams.get('date_from')
  const dateTo    = searchParams.get('date_to')

  // 1. Invoices matching date range + active statuses
  let invQuery = supabase
    .from('invoices')
    .select('id, invoice_number, status, period_from, company_id, company:companies!company_id(id, name)')
    .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])

  if (dateFrom) invQuery = invQuery.gte('period_from', dateFrom)
  if (dateTo)   invQuery = invQuery.lte('period_from', dateTo)

  const { data: invoices, error: invErr } = await invQuery
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json([])

  const invoiceIds  = invoices.map(i => i.id)
  const invoiceMap  = Object.fromEntries(invoices.map(i => [i.id, i]))

  // 2. Line items for those invoices
  const { data: lineItems, error: liErr } = await supabase
    .from('invoice_line_items')
    .select('id, invoice_id, booking_id, trip_sheet_id, booking_ref, trip_date, guest_name, hire_charges, bata_amount, bill_bata, toll_amount, parking_amount, permit_amount, line_total, vehicle_type, trip_type')
    .in('invoice_id', invoiceIds)
    .order('trip_date', { ascending: false })

  if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 })
  if (!lineItems?.length) return NextResponse.json([])

  // 3. Fetch bookings for driver_id lookup
  const bookingIds = [...new Set(lineItems.map(li => li.booking_id).filter(Boolean))] as string[]
  const bookingMap: Record<string, { driver_id: string | null }> = {}
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, driver_id')
      .in('id', bookingIds)
    for (const b of bookings ?? []) bookingMap[b.id] = b
  }

  // 4. Fetch drivers for commission + bata rate
  const driverIds = [...new Set(Object.values(bookingMap).map(b => b.driver_id).filter(Boolean))] as string[]
  const driverMap: Record<string, { id: string; name: string; commission_percent: number | null; bata_rate: number | null }> = {}
  if (driverIds.length > 0) {
    const { data: drivers } = await supabase
      .from('drivers')
      .select('id, name, commission_percent, bata_rate')
      .in('id', driverIds)
    for (const d of drivers ?? []) driverMap[d.id] = d
  }

  // 5. Fetch trip sheets for driver-side values
  const sheetIds = [...new Set(lineItems.map(li => li.trip_sheet_id).filter(Boolean))] as string[]
  const sheetMap: Record<string, {
    bata_driver: number | null
    toll_amount: number | null; parking_amount: number | null; permit_amount: number | null
    driver_toll_amount: number | null; driver_parking_amount: number | null; driver_permit_amount: number | null
  }> = {}
  if (sheetIds.length > 0) {
    const { data: sheets } = await supabase
      .from('trip_sheets')
      .select('id, bata_driver, toll_amount, parking_amount, permit_amount, driver_toll_amount, driver_parking_amount, driver_permit_amount')
      .in('id', sheetIds)
    for (const s of sheets ?? []) sheetMap[s.id] = s
  }

  // 6. Build result rows
  const rows = lineItems.map(li => {
    const inv      = invoiceMap[li.invoice_id]
    const booking  = li.booking_id ? bookingMap[li.booking_id] : null
    const driver   = booking?.driver_id ? driverMap[booking.driver_id] : null
    const sheet    = li.trip_sheet_id ? sheetMap[li.trip_sheet_id] : null

    const hireCharges    = Number(li.hire_charges ?? 0)
    const commissionPct  = Number(driver?.commission_percent ?? 20)
    const bataRate       = Number(driver?.bata_rate ?? 300)
    const bataCount      = Number(sheet?.bata_driver ?? 0)

    const driverHireCost      = r2(hireCharges * (1 - commissionPct / 100))
    const companyHireMargin   = r2(hireCharges * (commissionPct / 100))

    const bataBilled  = li.bill_bata ? Number(li.bata_amount ?? 0) : 0
    const bataPaid    = li.trip_type === 'airport' ? 0 : r2(bataCount * bataRate)
    const bataProfit  = r2(bataBilled - bataPaid)

    const reimbBilled  = r2(Number(li.toll_amount ?? 0) + Number(li.parking_amount ?? 0) + Number(li.permit_amount ?? 0))
    const driverToll   = Number(sheet?.driver_toll_amount   ?? sheet?.toll_amount    ?? 0)
    const driverPark   = Number(sheet?.driver_parking_amount ?? sheet?.parking_amount ?? 0)
    const driverPermit = Number(sheet?.driver_permit_amount  ?? sheet?.permit_amount  ?? 0)
    const reimbPaid    = r2(driverToll + driverPark + driverPermit)
    const reimbProfit  = r2(reimbBilled - reimbPaid)

    const totalMargin = r2(companyHireMargin + bataProfit + reimbProfit)
    const marginPct   = hireCharges > 0 ? r2((totalMargin / hireCharges) * 100) : 0

    return {
      id:                  li.id,
      trip_date:           li.trip_date,
      booking_ref:         li.booking_ref,
      guest_name:          li.guest_name,
      company_name:        (inv?.company as { name?: string } | null)?.name ?? '—',
      invoice_number:      inv?.invoice_number ?? null,
      driver_name:         driver?.name ?? '—',
      commission_pct:      commissionPct,
      hire_charges:        hireCharges,
      driver_hire_cost:    driverHireCost,
      company_hire_margin: companyHireMargin,
      bata_billed:         bataBilled,
      bata_paid:           bataPaid,
      bata_profit:         bataProfit,
      reimb_billed:        reimbBilled,
      reimb_paid:          reimbPaid,
      reimb_profit:        reimbProfit,
      line_total:          Number(li.line_total ?? 0),
      total_margin:        totalMargin,
      margin_pct:          marginPct,
      trip_type:           li.trip_type,
    }
  })

  return NextResponse.json(rows)
}
