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
