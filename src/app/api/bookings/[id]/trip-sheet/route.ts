import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('trip_sheets')
    .select('*, leg:booking_legs(day_number, leg_date)')
    .eq('booking_id', id)
    .order('created_at', { ascending: true })
  return NextResponse.json(data || [])
}
