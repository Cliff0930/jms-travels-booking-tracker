import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, booking_ref, pickup_location, drop_location, pickup_location_url, drop_location_url, pickup_date, pickup_time, guest_name, guest_phone, trip_type, status, pax_count, company:companies!company_id(name)')
    .eq('driver_id', verified.driverId)
    .in('status', ['completed', 'cancelled'])
    .order('pickup_date', { ascending: false })
    .limit(200)

  if (!bookings || bookings.length === 0) return NextResponse.json([])

  const [{ data: sheets }, { data: driverData }] = await Promise.all([
    supabase
      .from('trip_sheets')
      .select('booking_id, tripsheet_number, opening_km, closing_km, manual_opening_time, manual_closing_time, toll_amount, parking_amount, permit_amount, opening_time, closing_time, bata_driver, tripsheet_doc_received, reimbursed_at')
      .in('booking_id', bookings.map(b => b.id))
      .order('created_at', { ascending: true }),
    supabase
      .from('drivers')
      .select('bata_rate, bata_rate_outstation')
      .eq('id', verified.driverId)
      .single(),
  ])

  const bataRate    = (driverData as { bata_rate?: number | null } | null)?.bata_rate ?? 0
  const bataRateOut = (driverData as { bata_rate_outstation?: number | null } | null)?.bata_rate_outstation ?? bataRate

  const sheetsByBooking: Record<string, typeof sheets> = {}
  for (const sheet of sheets ?? []) {
    if (!sheetsByBooking[sheet.booking_id]) sheetsByBooking[sheet.booking_id] = []
    sheetsByBooking[sheet.booking_id]!.push(sheet)
  }

  return NextResponse.json(bookings.map(({ pickup_date, pickup_time, pax_count, company, ...b }) => {
    const bookingSheets = sheetsByBooking[b.id] ?? []
    const rate = b.trip_type === 'outstation' ? bataRateOut : bataRate

    let total = 0
    let allDocsReceived = true
    let allReimbursed = true
    let hasAmounts = false

    for (const s of bookingSheets) {
      const sheetTotal = (s.toll_amount ?? 0) + (s.parking_amount ?? 0) + (s.permit_amount ?? 0) + (s.bata_driver ?? 0) * rate
      if (sheetTotal > 0) {
        hasAmounts = true
        total += sheetTotal
        if (!s.tripsheet_doc_received) allDocsReceived = false
        if (!s.reimbursed_at) allReimbursed = false
      }
    }

    type ReimbStatus = 'none' | 'docs_pending' | 'payment_pending' | 'paid'
    let reimbursement_status: ReimbStatus = 'none'
    if (hasAmounts) {
      if (!allDocsReceived) reimbursement_status = 'docs_pending'
      else if (!allReimbursed) reimbursement_status = 'payment_pending'
      else reimbursement_status = 'paid'
    }

    return {
      ...b,
      pickup_datetime: `${pickup_date}T${pickup_time ?? '00:00:00'}`,
      pax: pax_count ?? 0,
      company_name: (company as { name?: string } | null)?.name ?? null,
      sheets: bookingSheets,
      reimbursement_status,
      reimbursement_total: hasAmounts ? Math.round(total) : 0,
    }
  }))
}
