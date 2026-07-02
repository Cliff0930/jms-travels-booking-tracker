import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createAdminClient()

  // Fetch all completed bookings that are not excluded
  const { data: completedBookings } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, pickup_date, guest_name, booking_type, company_id, guest_client_id,
      company:companies!company_id(name),
      driver:drivers!driver_id(name, vehicle_name, vehicle_number)
    `)
    .eq('status', 'completed')
    .or('exclude_from_billing.is.null,exclude_from_billing.eq.false')
    .order('pickup_date', { ascending: false })
    .limit(500)

  if (!completedBookings || completedBookings.length === 0) {
    return NextResponse.json({ unbilled: [], unsettled: [] })
  }

  const bookingIds = completedBookings.map(b => b.id)

  // Find booking IDs that are in a non-cancelled invoice
  const invoicedIds = new Set<string>()
  const { data: invItems } = await supabase
    .from('invoice_line_items')
    .select('booking_id, invoice:invoices!invoice_id(status)')
    .in('booking_id', bookingIds)
  for (const item of invItems ?? []) {
    const status = (item.invoice as unknown as { status: string } | null)?.status
    if (status && status !== 'cancelled') invoicedIds.add(item.booking_id)
  }

  // Find booking IDs that are in a cash bill
  const cashBilledIds = new Set<string>()
  const { data: cbItems } = await supabase
    .from('cash_bill_line_items')
    .select('booking_id, cash_bill:cash_bills!cash_bill_id(status)')
    .in('booking_id', bookingIds)
  for (const item of cbItems ?? []) {
    const status = (item.cash_bill as unknown as { status: string } | null)?.status
    if (status && status !== 'cancelled') cashBilledIds.add(item.booking_id)
  }

  // Find booking IDs that are in a driver settlement
  const settledIds = new Set<string>()
  const { data: settlementTrips } = await supabase
    .from('driver_settlement_trips')
    .select('booking_id')
    .in('booking_id', bookingIds)
  for (const item of settlementTrips ?? []) {
    if (item.booking_id) settledIds.add(item.booking_id)
  }

  // Build results
  const unbilled = completedBookings.filter(b => {
    if (b.booking_type === 'personal') return !cashBilledIds.has(b.id)
    return !invoicedIds.has(b.id) && !cashBilledIds.has(b.id)
  })

  const unsettled = completedBookings.filter(b => !settledIds.has(b.id))

  function mapBooking(b: Record<string, unknown>) {
    return {
      id: b.id,
      booking_ref: b.booking_ref,
      pickup_date: b.pickup_date,
      guest_name: b.guest_name,
      booking_type: b.booking_type,
      company_name: (b.company as { name: string } | null)?.name ?? null,
      driver_name: (b.driver as { name: string } | null)?.name ?? null,
      vehicle: (b.driver as { vehicle_name?: string; vehicle_number?: string } | null)?.vehicle_number ?? null,
    }
  }

  return NextResponse.json({
    unbilled: unbilled.map(b => mapBooking(b as Record<string, unknown>)),
    unsettled: unsettled.map(b => mapBooking(b as Record<string, unknown>)),
  })
}
