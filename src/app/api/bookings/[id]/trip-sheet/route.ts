import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('trip_sheets')
    .select('*')
    .eq('booking_id', id)
    .order('created_at', { ascending: true })

  if (error) console.error(`[trip-sheet] query failed booking=${id}:`, error.message)

  // Enrich with leg data for multi-day trips
  const sheets = data || []
  const legIds = sheets.map(s => s.booking_leg_id).filter(Boolean)
  if (legIds.length > 0) {
    const { data: legs } = await supabase
      .from('booking_legs')
      .select('id, day_number, leg_date')
      .in('id', legIds)
    if (legs) {
      const legMap = Object.fromEntries(legs.map(l => [l.id, l]))
      for (const sheet of sheets) {
        sheet.leg = sheet.booking_leg_id ? (legMap[sheet.booking_leg_id] ?? null) : null
      }
    }
  }

  return NextResponse.json(sheets)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const sheetId = url.searchParams.get('sheetId')
  if (!sheetId) return NextResponse.json({ error: 'sheetId required' }, { status: 400 })

  const supabase = createAdminClient()
  const body = await request.json() as Record<string, unknown>

  const allowed = [
    'tripsheet_number', 'opening_km', 'closing_km', 'manual_opening_time', 'manual_closing_time',
    'toll_amount', 'parking_amount', 'permit_amount', 'bata_driver', 'bata_client',
    'driver_opening_km', 'driver_closing_km', 'driver_opening_time', 'driver_closing_time',
    'client_opening_km', 'client_closing_km', 'client_opening_time', 'client_closing_time',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in body) update[key] = body[key] === '' ? null : body[key]
  }

  const { error } = await supabase.from('trip_sheets').update(update).eq('id', sheetId).eq('booking_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
