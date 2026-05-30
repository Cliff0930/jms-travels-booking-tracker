import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { extractDriverToken } from '@/lib/utils/driver-app-auth'

export async function GET(request: Request) {
  const verified = extractDriverToken(request)
  if (!verified) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  const { data: entries, error } = await supabase
    .from('driver_advances')
    .select('id, type, amount, payment_mode, note, status, settled_via, settled_at, created_at, booking:bookings!booking_id(booking_ref)')
    .eq('driver_id', verified.driverId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const outstanding = (entries ?? []).filter(e => e.status === 'outstanding')
  const totalOwed = outstanding.reduce((sum, e) => sum + Number(e.amount), 0)
  const advanceTotal = outstanding.filter(e => e.type === 'advance').reduce((sum, e) => sum + Number(e.amount), 0)
  const collectionTotal = outstanding.filter(e => e.type === 'collection').reduce((sum, e) => sum + Number(e.amount), 0)

  return NextResponse.json({
    total_owed: totalOwed,
    advance_total: advanceTotal,
    collection_total: collectionTotal,
    entries: entries ?? [],
  })
}
