import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('driver_settlements')
    .select('id, period_from, period_to, total_trips, hire_earnings, bata_earnings, reimbursements, salary_amount, gross_earnings, advance_principal_deduction, advance_interest_deduction, other_deductions, net_payable, payment_mode, paid_at')
    .eq('driver_id', verified.driverId)
    .eq('status', 'paid')
    .order('period_from', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
