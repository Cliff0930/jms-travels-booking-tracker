import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

function r2(n: number) { return Math.round(n * 100) / 100 }

export async function GET(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const dateFrom  = searchParams.get('date_from')
  const dateTo    = searchParams.get('date_to')
  const companyId = searchParams.get('company_id')

  // 1. Fetch invoices matching filters
  let invQuery = supabase
    .from('invoices')
    .select('id, invoice_number, status, period_from, company_id, company:companies!company_id(id, name)')
    .in('status', ['sent', 'paid', 'partially_paid', 'overdue'])

  if (dateFrom)  invQuery = invQuery.gte('period_from', dateFrom)
  if (dateTo)    invQuery = invQuery.lte('period_from', dateTo)
  if (companyId) invQuery = invQuery.eq('company_id', companyId)

  const { data: invoices, error: invErr } = await invQuery
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoices?.length) return NextResponse.json([])

  const invoiceIds = invoices.map(i => i.id)
  const invoiceMap = Object.fromEntries(invoices.map(i => [i.id, i]))

  // 2. Fetch line items with booking → driver and trip_sheet joins
  const { data: lineItems, error: liErr } = await supabase
    .from('invoice_line_items')
    .select(`
      id, invoice_id, booking_id, trip_sheet_id, booking_ref, trip_date, guest_name,
      hire_charges, bata_amount, bill_bata,
      toll_amount, parking_amount, permit_amount, line_total, vehicle_type, trip_type,
      booking:bookings!booking_id(
        driver_id,
        driver:drivers!driver_id(id, name, commission_percent, bata_rate)
      ),
      trip_sheet:trip_sheets!trip_sheet_id(
        bata_driver,
        toll_amount, parking_amount, permit_amount,
        driver_toll_amount, driver_parking_amount, driver_permit_amount
      )
    `)
    .in('invoice_id', invoiceIds)
    .order('trip_date', { ascending: false })

  if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 })

  const rows = (lineItems ?? []).map(li => {
    const inv = invoiceMap[li.invoice_id]
    const driver = (li.booking as any)?.driver ?? null
    const sheet  = (li.trip_sheet as any) ?? null

    const hireCharges    = Number(li.hire_charges ?? 0)
    const commissionPct  = Number(driver?.commission_percent ?? 20)
    const bataRate       = Number(driver?.bata_rate ?? 300)
    const bataCount      = Number(sheet?.bata_driver ?? 0)

    // Driver cost components
    const driverHireCost  = r2(hireCharges * (1 - commissionPct / 100))
    const companyHireMargin = r2(hireCharges * (commissionPct / 100))

    // Bata: billed to client vs paid to driver
    const bataBilled = li.bill_bata ? Number(li.bata_amount ?? 0) : 0
    const bataPaid   = li.trip_type === 'airport' ? 0 : r2(bataCount * bataRate)
    const bataProfit = r2(bataBilled - bataPaid)

    // Reimbursements: billed to client vs paid to driver
    const reimbBilled  = r2(Number(li.toll_amount ?? 0) + Number(li.parking_amount ?? 0) + Number(li.permit_amount ?? 0))
    const driverToll   = Number(sheet?.driver_toll_amount   ?? sheet?.toll_amount    ?? 0)
    const driverPark   = Number(sheet?.driver_parking_amount ?? sheet?.parking_amount ?? 0)
    const driverPermit = Number(sheet?.driver_permit_amount  ?? sheet?.permit_amount  ?? 0)
    const reimbPaid    = r2(driverToll + driverPark + driverPermit)
    const reimbProfit  = r2(reimbBilled - reimbPaid)

    // Total margin (excl. GST — comparing pre-tax billed vs driver cost)
    const totalMargin    = r2(companyHireMargin + bataProfit + reimbProfit)
    const marginPct      = hireCharges > 0 ? r2((totalMargin / hireCharges) * 100) : 0

    return {
      id:              li.id,
      trip_date:       li.trip_date,
      booking_ref:     li.booking_ref,
      guest_name:      li.guest_name,
      company_name:    (inv?.company as any)?.name ?? '—',
      invoice_number:  inv?.invoice_number ?? null,
      driver_name:     driver?.name ?? '—',
      commission_pct:  commissionPct,
      hire_charges:    hireCharges,
      driver_hire_cost: driverHireCost,
      company_hire_margin: companyHireMargin,
      bata_billed:     bataBilled,
      bata_paid:       bataPaid,
      bata_profit:     bataProfit,
      reimb_billed:    reimbBilled,
      reimb_paid:      reimbPaid,
      reimb_profit:    reimbProfit,
      line_total:      Number(li.line_total ?? 0),
      total_margin:    totalMargin,
      margin_pct:      marginPct,
      trip_type:       li.trip_type,
    }
  })

  return NextResponse.json(rows)
}
