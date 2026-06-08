import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createAdminClient()

  const [{ data: settlement, error }, { data: trips }] = await Promise.all([
    supabase
      .from('driver_settlements')
      .select('id, period_from, period_to, total_trips, hire_earnings, bata_earnings, reimbursements, salary_amount, gross_earnings, advance_principal_deduction, advance_interest_deduction, other_deductions, net_payable, payment_mode, paid_at')
      .eq('id', id)
      .eq('driver_id', verified.driverId)
      .eq('status', 'paid')
      .single(),
    supabase
      .from('driver_settlement_trips')
      .select('trip_date, booking_ref, tripsheet_number, company_name, trip_type, actual_kms, hire_earnings, bata_earnings, toll_amount, parking_amount, permit_amount, trip_total')
      .eq('settlement_id', id)
      .order('trip_date', { ascending: true }),
  ])

  if (error || !settlement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ...settlement, trips: trips ?? [] })
}
