import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const driverId = searchParams.get('driver_id')
  const bookingId = searchParams.get('booking_id')
  const status = searchParams.get('status') ?? 'outstanding'
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  // Special mode: return per-driver outstanding totals for the drivers page pill
  const totalsMode = searchParams.get('totals') === '1'

  const supabase = createAdminClient()

  if (totalsMode) {
    const { data, error } = await supabase
      .from('driver_advances')
      .select('driver_id, amount')
      .eq('status', 'outstanding')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Sum per driver
    const map: Record<string, number> = {}
    for (const row of data ?? []) {
      map[row.driver_id] = (map[row.driver_id] ?? 0) + Number(row.amount)
    }
    return NextResponse.json(map)
  }

  let q = supabase
    .from('driver_advances')
    .select('*, driver:drivers!driver_id(id, name), booking:bookings!booking_id(booking_ref)')
    .order('created_at', { ascending: false })
    .limit(500)

  if (status !== 'all') q = q.eq('status', status)

  if (driverId) q = q.eq('driver_id', driverId)
  if (bookingId) q = q.eq('booking_id', bookingId)
  if (dateFrom) q = q.gte('created_at', dateFrom)
  if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const supabase = createAdminClient()
  const body = await request.json() as {
    driver_id: string
    booking_id?: string | null
    type: 'advance' | 'collection'
    amount: number
    payment_mode: 'cash' | 'phonepe' | 'gpay' | 'cc'
    note?: string
    created_at?: string
    created_by?: string
  }

  const { data, error } = await supabase
    .from('driver_advances')
    .insert({
      driver_id: body.driver_id,
      booking_id: body.booking_id || null,
      type: body.type,
      amount: body.amount,
      payment_mode: body.payment_mode,
      note: body.note || null,
      created_at: body.created_at || new Date().toISOString(),
      created_by: body.created_by || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
