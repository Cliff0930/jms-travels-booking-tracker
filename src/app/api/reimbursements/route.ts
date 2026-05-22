import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const driverId = searchParams.get('driver_id')
  const status = searchParams.get('status') ?? 'pending'
  const search = searchParams.get('search')?.toLowerCase().trim()
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  const supabase = createAdminClient()

  let bookingQuery = supabase
    .from('bookings')
    .select(`
      id, booking_ref, pickup_date, company_id, driver_id, guest_name, guest_phone, requested_by,
      company:companies!company_id(name),
      client:clients!client_id(primary_phone),
      driver:drivers!driver_id(id, name, vehicle_name, bata_rate),
      trip_sheets(
        id, tripsheet_number, toll_amount, parking_amount, permit_amount, bata_driver,
        tripsheet_doc_received, toll_received, parking_received, permit_received, bata_received,
        toll_paid, parking_paid, permit_paid, bata_paid,
        reimbursement_notes, reimbursed_at, created_at
      )
    `)
    .eq('status', 'completed')
    .not('driver_id', 'is', null)
    .order('pickup_date', { ascending: false })

  if (driverId) bookingQuery = bookingQuery.eq('driver_id', driverId)
  if (dateFrom) bookingQuery = bookingQuery.gte('pickup_date', dateFrom)
  if (dateTo) bookingQuery = bookingQuery.lte('pickup_date', dateTo)

  const { data: bookings, error } = await bookingQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!bookings?.length) return NextResponse.json([])

  // Fetch company bata rates for all involved companies
  const companyIds = [...new Set(bookings.map(b => b.company_id).filter(Boolean))]
  const bataRateMap: Record<string, Record<string, number>> = {}
  if (companyIds.length > 0) {
    const { data: rates } = await supabase
      .from('company_bata_rates')
      .select('company_id, vehicle_name, rate_per_bata')
      .in('company_id', companyIds as string[])
    for (const r of rates ?? []) {
      if (!bataRateMap[r.company_id]) bataRateMap[r.company_id] = {}
      bataRateMap[r.company_id][r.vehicle_name.toLowerCase()] = r.rate_per_bata
    }
  }

  // Flatten to one entry per trip_sheet
  const result = []
  for (const booking of bookings) {
    const driver = booking.driver as unknown as { id: string; name: string; vehicle_name: string; bata_rate: number | null } | null
    const company = booking.company as unknown as { name: string } | null
    const sheets = (booking.trip_sheets ?? []) as Array<Record<string, unknown>>

    for (const sheet of sheets) {
      const toll = (sheet.toll_amount as number | null) ?? 0
      const parking = (sheet.parking_amount as number | null) ?? 0
      const permit = (sheet.permit_amount as number | null) ?? 0
      const bataCount = (sheet.bata_driver as number | null) ?? 0

      // Only include sheets with at least one reimbursable item
      if (toll <= 0 && parking <= 0 && permit <= 0 && bataCount <= 0) continue

      // Resolve bata rate: company override → driver default → null
      let bataRate: number | null = null
      if (bataCount > 0 && driver) {
        const companyRates = booking.company_id ? bataRateMap[booking.company_id] : undefined
        const vehicleKey = driver.vehicle_name.toLowerCase()
        if (companyRates?.[vehicleKey] != null) {
          bataRate = companyRates[vehicleKey]
        } else {
          bataRate = driver.bata_rate ?? null
        }
      }

      const entry = {
        sheet_id: sheet.id,
        booking_id: booking.id,
        booking_ref: booking.booking_ref,
        tripsheet_number: (sheet.tripsheet_number as string | null) ?? null,
        guest_name: (booking.guest_name as string | null) ?? null,
        guest_phone: (booking.guest_phone as string | null) ?? null,
        requested_by: (booking.requested_by as string | null) ?? null,
        client_phone: ((booking.client as unknown as { primary_phone: string | null } | null)?.primary_phone) ?? null,
        pickup_date: booking.pickup_date,
        company_id: booking.company_id,
        company_name: company?.name ?? null,
        driver_id: driver?.id ?? null,
        driver_name: driver?.name ?? null,
        driver_vehicle_name: driver?.vehicle_name ?? null,
        // amounts
        toll_amount: toll > 0 ? toll : null,
        parking_amount: parking > 0 ? parking : null,
        permit_amount: permit > 0 ? permit : null,
        bata_driver: bataCount > 0 ? bataCount : null,
        bata_rate: bataRate,
        bata_amount: bataCount > 0 && bataRate != null ? bataCount * bataRate : null,
        // received/paid flags
        tripsheet_doc_received: sheet.tripsheet_doc_received as boolean ?? false,
        toll_received: sheet.toll_received as boolean ?? false,
        parking_received: sheet.parking_received as boolean ?? false,
        permit_received: sheet.permit_received as boolean ?? false,
        bata_received: sheet.bata_received as boolean ?? false,
        toll_paid: sheet.toll_paid as boolean ?? false,
        parking_paid: sheet.parking_paid as boolean ?? false,
        permit_paid: sheet.permit_paid as boolean ?? false,
        bata_paid: sheet.bata_paid as boolean ?? false,
        reimbursement_notes: sheet.reimbursement_notes as string | null,
        reimbursed_at: sheet.reimbursed_at as string | null,
        created_at: sheet.created_at as string,
      }

      const isSettled = !!entry.reimbursed_at
      if (status === 'settled' && !isSettled) continue
      if (status === 'pending' && isSettled) continue

      if (search) {
        const ref = entry.booking_ref?.toLowerCase() ?? ''
        const driverName = entry.driver_name?.toLowerCase() ?? ''
        if (!ref.includes(search) && !driverName.includes(search)) continue
      }

      result.push(entry)
    }
  }

  return NextResponse.json(result)
}

// GET distinct drivers who have reimbursable sheets
export async function HEAD(_request: Request) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('bookings')
    .select('driver_id, driver:drivers!driver_id(id, name)')
    .eq('status', 'completed')
    .not('driver_id', 'is', null)
  return NextResponse.json(data ?? [], { status: 200 })
}
